'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useDocumentVisibility } from '@hooks/ui/use-document-visibility/use-document-visibility';
import type {
  AvatarProvider,
  ClipsStep,
  IHighlight,
  ProjectState,
  ProviderOption,
} from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineFilm,
  HiOutlineMagnifyingGlass,
  HiOutlineSparkles,
} from 'react-icons/hi2';

import ClipResultCard from './components/ClipResultCard';
import HighlightReviewCard from './components/HighlightReviewCard';
import { ClipsApiService } from './services/clips-api.service';

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    description: 'Best Quality',
    disabled: false,
    label: 'HeyGen',
    value: 'heygen',
  },
  { description: 'Coming Soon', disabled: true, label: 'D-ID', value: 'did' },
  {
    description: 'Coming Soon',
    disabled: true,
    label: 'Tavus',
    value: 'tavus',
  },
  {
    description: 'Self-hosted, free',
    disabled: true,
    label: 'MuseTalk',
    value: 'musetalk',
  },
];

const TERMINAL_PROJECT_STATUSES = new Set(['completed', 'failed']);

export default function StudioClipsPage() {
  const { getToken } = useAuth();

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveClerkToken(getToken)) ?? '';
  }, [getToken]);

  const clipsService = useMemo(
    () => new ClipsApiService(resolveToken),
    [resolveToken],
  );

  // Step tracking
  const [step, setStep] = useState<ClipsStep>('input');

  // Form state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [avatarProvider, setAvatarProvider] =
    useState<AvatarProvider>('heygen');
  const [maxClips, setMaxClips] = useState(10);
  const [minViralityScore, setMinViralityScore] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Project state
  const [project, setProject] = useState<ProjectState | null>(null);

  // Highlight selection state (maps highlight id -> highlight with edits)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editedHighlights, setEditedHighlights] = useState<IHighlight[]>([]);

  const analysisPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const clipsPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isDocumentVisible = useDocumentVisibility();

  // ─── Step 1: Analyze ─────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!youtubeUrl) {
      setError('YouTube URL is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const data = await clipsService.analyzeVideo({
        language: 'en',
        maxClips,
        minViralityScore,
        youtubeUrl,
      });

      setProject({
        clips: [],
        highlights: [],
        projectId: data.projectId,
        status: 'analyzing',
      });
      setStep('review');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [youtubeUrl, maxClips, minViralityScore, clipsService]);

  // ─── Poll for analysis completion ─────────────────────────────
  useEffect(() => {
    if (step !== 'review' || !project?.projectId) return;
    if (project.status === 'analyzed' || project.status === 'failed') return;
    if (!isDocumentVisible) return;

    let cancelled = false;
    const abortController = new AbortController();
    const clearPendingPoll = () => {
      if (analysisPollTimeoutRef.current) {
        clearTimeout(analysisPollTimeoutRef.current);
        analysisPollTimeoutRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      clearPendingPoll();

      if (cancelled) {
        return;
      }

      analysisPollTimeoutRef.current = setTimeout(() => {
        void pollAnalysis();
      }, 2_000);
    };

    const pollAnalysis = async () => {
      try {
        const data = await clipsService.getHighlights(
          project.projectId,
          abortController.signal,
        );

        if (cancelled) {
          return;
        }

        if (data.status === 'analyzed') {
          const highlights: IHighlight[] = data.highlights ?? [];
          setProject((prev) =>
            prev ? { ...prev, highlights, status: 'analyzed' } : prev,
          );
          setEditedHighlights(highlights);
          setSelectedIds(new Set(highlights.map((h: IHighlight) => h.id)));
          clearPendingPoll();
        } else if (data.status === 'failed') {
          setProject((prev) => (prev ? { ...prev, status: 'failed' } : prev));
          clearPendingPoll();
        } else {
          scheduleNextPoll();
        }
      } catch (pollError: unknown) {
        if (
          pollError instanceof DOMException &&
          pollError.name === 'AbortError'
        ) {
          return;
        }

        scheduleNextPoll();
      }
    };

    void pollAnalysis();

    return () => {
      cancelled = true;
      abortController.abort();
      clearPendingPoll();
    };
  }, [
    step,
    project?.projectId,
    project?.status,
    clipsService,
    isDocumentVisible,
  ]);

  // ─── Step 2: Generate selected highlights ─────────────────────
  const handleGenerate = useCallback(async () => {
    if (!project?.projectId || !avatarId || !voiceId) {
      setError('Avatar ID and Voice ID are required to generate clips.');
      return;
    }

    const ids = Array.from(selectedIds);
    const selectedEditedHighlights = editedHighlights.filter((highlight) =>
      selectedIds.has(highlight.id),
    );

    if (ids.length === 0) {
      setError('Select at least one highlight to generate.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await clipsService.generateClips(project.projectId, {
        avatarId,
        avatarProvider,
        editedHighlights: selectedEditedHighlights.map((highlight) => ({
          id: highlight.id,
          summary: highlight.summary,
          title: highlight.title,
        })),
        selectedHighlightIds: ids,
        voiceId,
      });

      setProject((prev) => (prev ? { ...prev, status: 'generating' } : prev));
      setStep('progress');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    project?.projectId,
    avatarId,
    voiceId,
    avatarProvider,
    selectedIds,
    editedHighlights,
    clipsService,
  ]);

  // ─── Poll for clip results (Step 3) ───────────────────────────
  useEffect(() => {
    if (step !== 'progress' || !project?.projectId) return;
    if (!isDocumentVisible) return;

    let cancelled = false;
    const abortController = new AbortController();
    const clearPendingPoll = () => {
      if (clipsPollTimeoutRef.current) {
        clearTimeout(clipsPollTimeoutRef.current);
        clipsPollTimeoutRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      clearPendingPoll();

      if (cancelled) {
        return;
      }

      clipsPollTimeoutRef.current = setTimeout(() => {
        void pollClips();
      }, 3_000);
    };

    const pollClips = async () => {
      try {
        const [projectData, clips] = await Promise.all([
          clipsService.getProject(project.projectId, abortController.signal),
          clipsService.getClipResults(
            project.projectId,
            abortController.signal,
          ),
        ]);

        if (cancelled) {
          return;
        }

        const projectStatus = projectData.status ?? 'generating';

        setProject((prev) =>
          prev ? { ...prev, clips, status: projectStatus } : prev,
        );

        if (TERMINAL_PROJECT_STATUSES.has(projectStatus)) {
          clearPendingPoll();
        } else {
          scheduleNextPoll();
        }
      } catch (pollError: unknown) {
        if (
          pollError instanceof DOMException &&
          pollError.name === 'AbortError'
        ) {
          return;
        }

        scheduleNextPoll();
      }
    };

    void pollClips();

    return () => {
      cancelled = true;
      abortController.abort();
      clearPendingPoll();
    };
  }, [step, project?.projectId, clipsService, isDocumentVisible]);

  // ─── Highlight edit helpers ────────────────────────────────────
  const toggleHighlight = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateHighlightTitle = useCallback((id: string, title: string) => {
    setEditedHighlights((prev) =>
      prev.map((h) => (h.id === id ? { ...h, title } : h)),
    );
  }, []);

  const updateHighlightScript = useCallback((id: string, summary: string) => {
    setEditedHighlights((prev) =>
      prev.map((h) => (h.id === id ? { ...h, summary } : h)),
    );
  }, []);

  const resetToInput = useCallback(() => {
    setStep('input');
    setProject(null);
    setSelectedIds(new Set());
    setEditedHighlights([]);
    setError(null);
  }, []);

  const selectedCount = selectedIds.size;

  // ═══════════════════════════════════════════════════════════════
  // Step 3: Progress view
  // ═══════════════════════════════════════════════════════════════
  if (step === 'progress' && project) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <HiOutlineFilm className="h-6 w-6 text-indigo-400" />
            <h1 className="text-2xl font-semibold text-zinc-100">
              AI Clip Factory
            </h1>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {project.status === 'completed'
              ? `Done -- ${project.clips.length} clips generated`
              : project.status === 'failed'
                ? 'Pipeline failed. Check logs for details.'
                : `Generating ${selectedCount} clips...`}
          </p>

          {project.status !== 'completed' && project.status !== 'failed' && (
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-500 transition-all duration-500" />
              </div>
              <span className="text-xs capitalize text-zinc-500">
                {project.status}
              </span>
            </div>
          )}
        </div>

        {project.clips.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.clips.map((clip) => (
              <ClipResultCard
                key={clip._id}
                clip={clip}
                clipsService={clipsService}
              />
            ))}
          </div>
        ) : (
          project.status !== 'completed' && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
              <Spinner
                size={ComponentSize.LG}
                className="mb-4 text-indigo-500"
              />
              <p className="text-sm text-zinc-500">
                Generating avatar clips for selected highlights...
              </p>
            </div>
          )
        )}

        <div className="mt-8">
          <Button
            variant={ButtonVariant.LINK}
            className="text-sm text-zinc-500 hover:text-zinc-300"
            onClick={resetToInput}
            label="Start new project"
          />
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 2: Review highlights
  // ═══════════════════════════════════════════════════════════════
  if (step === 'review' && project) {
    const isAnalyzing =
      project.status !== 'analyzed' && project.status !== 'failed';

    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <HiOutlineMagnifyingGlass className="h-6 w-6 text-indigo-400" />
            <h1 className="text-2xl font-semibold text-zinc-100">
              Review Highlights
            </h1>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {isAnalyzing
              ? 'Analyzing video -- detecting viral moments...'
              : project.status === 'failed'
                ? 'Analysis failed. Please try again.'
                : `Found ${editedHighlights.length} highlights. Edit scripts, deselect weak clips, then generate.`}
          </p>
        </div>

        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
            <Spinner size={ComponentSize.LG} className="mb-4 text-indigo-500" />
            <p className="text-sm text-zinc-500">
              Transcribing and analyzing video...
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              This usually takes 1-2 minutes
            </p>
          </div>
        ) : project.status === 'failed' ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Analysis failed. Check the YouTube URL and try again.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {editedHighlights.map((highlight) => (
                <HighlightReviewCard
                  key={highlight.id}
                  highlight={highlight}
                  selected={selectedIds.has(highlight.id)}
                  onToggle={() => toggleHighlight(highlight.id)}
                  onTitleEdit={(text) =>
                    updateHighlightTitle(highlight.id, text)
                  }
                  onScriptEdit={(text) =>
                    updateHighlightScript(highlight.id, text)
                  }
                  projectId={project?.projectId}
                  clipsService={clipsService}
                />
              ))}
            </div>

            {/* Avatar & Voice config */}
            <div className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-medium text-zinc-300">
                Avatar Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="avatar-id-review"
                    className="mb-1 block text-xs text-zinc-500"
                  >
                    Avatar ID
                  </label>
                  <Input
                    id="avatar-id-review"
                    type="text"
                    value={avatarId}
                    onChange={(e) => setAvatarId(e.target.value)}
                    placeholder="HeyGen avatar ID"
                  />
                </div>
                <div>
                  <label
                    htmlFor="voice-id-review"
                    className="mb-1 block text-xs text-zinc-500"
                  >
                    Voice ID
                  </label>
                  <Input
                    id="voice-id-review"
                    type="text"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="HeyGen voice ID"
                  />
                </div>
              </div>

              {/* Provider */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PROVIDER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={ButtonVariant.UNSTYLED}
                    isDisabled={opt.disabled}
                    onClick={() => setAvatarProvider(opt.value)}
                    className={`relative rounded-lg border px-3 py-2 text-left transition-all ${
                      avatarProvider === opt.value
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : opt.disabled
                          ? 'cursor-not-allowed border-zinc-800 bg-zinc-900/30 opacity-50'
                          : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-xs font-medium text-zinc-200">
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {opt.description}
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Generate button */}
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant={ButtonVariant.LINK}
                className="text-sm text-zinc-500 hover:text-zinc-300"
                onClick={resetToInput}
                label="Back"
              />

              <Button
                variant={ButtonVariant.UNSTYLED}
                onClick={handleGenerate}
                isDisabled={
                  isSubmitting || selectedCount === 0 || !avatarId || !voiceId
                }
                isLoading={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                icon={
                  isSubmitting ? (
                    <Spinner size={ComponentSize.SM} className="text-white" />
                  ) : (
                    <HiOutlineSparkles className="h-4 w-4" />
                  )
                }
                label={
                  isSubmitting
                    ? 'Generating...'
                    : `Generate ${selectedCount} clip${selectedCount !== 1 ? 's' : ''} (${selectedCount} credit${selectedCount !== 1 ? 's' : ''})`
                }
              />
            </div>
          </>
        )}

        {project.status === 'failed' && (
          <div className="mt-4">
            <Button
              variant={ButtonVariant.LINK}
              className="text-sm text-zinc-500 hover:text-zinc-300"
              onClick={resetToInput}
              label="Try again"
            />
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 1: Input form
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-2xl bg-indigo-500/10 p-3">
            <HiOutlineSparkles className="h-8 w-8 text-indigo-400" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold text-zinc-100">
          AI Clip Factory
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Drop a YouTube URL, review AI-detected highlights, generate avatar
          clips
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        {/* YouTube URL */}
        <div>
          <label
            htmlFor="youtube-url"
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            YouTube URL
          </label>
          <Input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>

        {/* Max Clips Slider */}
        <div>
          <label
            htmlFor="max-clips"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-zinc-300"
          >
            <span>Max Clips</span>
            <span className="text-xs text-zinc-500">{maxClips}</span>
          </label>
          <Input
            id="max-clips"
            type="range"
            min={1}
            max={30}
            value={maxClips}
            onChange={(e) => setMaxClips(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>1</span>
            <span>15</span>
            <span>30</span>
          </div>
        </div>

        {/* Min Virality Score */}
        <div>
          <label
            htmlFor="min-virality"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-zinc-300"
          >
            <span>Min Virality Score</span>
            <span className="text-xs text-zinc-500">{minViralityScore}</span>
          </label>
          <Input
            id="min-virality"
            type="range"
            min={0}
            max={100}
            value={minViralityScore}
            onChange={(e) => setMinViralityScore(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          variant={ButtonVariant.UNSTYLED}
          onClick={handleAnalyze}
          isDisabled={isSubmitting || !youtubeUrl}
          isLoading={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          icon={
            isSubmitting ? (
              <Spinner size={ComponentSize.SM} className="text-white" />
            ) : (
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
            )
          }
          label={isSubmitting ? 'Analyzing...' : 'Analyze Video'}
        />
      </div>
    </div>
  );
}
