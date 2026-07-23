import { useBrand } from '@contexts/user/brand-context/brand-context';
import { GenerationType } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { IBrand, IOrganizationSetting } from '@genfeedai/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useDocumentVisibility } from '@hooks/ui/use-document-visibility/use-document-visibility';
import type {
  AvatarProvider,
  ClipResultMode,
  ClipsStep,
  IHighlight,
  ProjectState,
} from '@props/studio/clips.props';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { ClipsApiService } from './services/clips-api.service';

const TERMINAL_PROJECT_STATUSES = new Set(['completed', 'failed']);

type StudioClipIdentityField = 'avatar' | 'voice';
type StudioClipIdentitySource = 'brand' | 'missing' | 'organization';

interface StudioClipIdentityDefaults {
  avatarId?: string;
  avatarProvider: AvatarProvider;
  isComplete: boolean;
  missing: StudioClipIdentityField[];
  source: StudioClipIdentitySource;
  voiceId?: string;
}

interface StudioClipIdentityContext {
  selectedBrand?: Pick<IBrand, 'agentConfig'> | null;
  settings?: Pick<IOrganizationSetting, 'defaultVoiceRef'> | null;
}

function isHeygenProvider(provider?: string | null): boolean {
  return provider?.toLowerCase() === 'heygen';
}

function readNonEmptyString(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function resolveHeygenVoiceRef(
  ref:
    | NonNullable<IBrand['agentConfig']>['defaultVoiceRef']
    | IOrganizationSetting['defaultVoiceRef']
    | undefined,
): string | undefined {
  if (
    ref?.source !== 'catalog' ||
    !isHeygenProvider(ref.provider) ||
    !ref.externalVoiceId
  ) {
    return undefined;
  }

  return readNonEmptyString(ref.externalVoiceId);
}

export function resolveStudioClipIdentityDefaults({
  selectedBrand,
  settings,
}: StudioClipIdentityContext): StudioClipIdentityDefaults {
  const brandConfig = selectedBrand?.agentConfig;
  const brandAvatarId = readNonEmptyString(brandConfig?.heygenAvatarId);
  const brandVoiceId =
    readNonEmptyString(brandConfig?.heygenVoiceId) ??
    resolveHeygenVoiceRef(brandConfig?.defaultVoiceRef);
  const organizationVoiceId = resolveHeygenVoiceRef(settings?.defaultVoiceRef);
  const avatarId = brandAvatarId;
  const voiceId = brandVoiceId ?? organizationVoiceId;
  const missing: StudioClipIdentityField[] = [];

  if (!avatarId) {
    missing.push('avatar');
  }

  if (!voiceId) {
    missing.push('voice');
  }

  return {
    avatarId,
    avatarProvider: 'heygen',
    isComplete: missing.length === 0,
    missing,
    source:
      avatarId || brandVoiceId
        ? 'brand'
        : organizationVoiceId
          ? 'organization'
          : 'missing',
    voiceId,
  };
}

export function useStudioClipsPage() {
  const { getToken } = useAuthIdentity();
  const { selectedBrand, settings } = useBrand();

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveAuthToken(getToken)) ?? '';
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
  const [generationMode, setGenerationMode] =
    useState<ClipResultMode>('avatar');
  const [maxClips, setMaxClips] = useState(10);
  const [minViralityScore, setMinViralityScore] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Project state
  const [project, setProject] = useState<ProjectState | null>(null);
  const [pendingReferenceFrameId, setPendingReferenceFrameId] = useState<
    string | null
  >(null);
  const [failedReferenceFrameId, setFailedReferenceFrameId] = useState<
    string | null
  >(null);
  const [referenceFrameError, setReferenceFrameError] = useState<string | null>(
    null,
  );

  // Highlight selection state (maps highlight id -> highlight with edits)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editedHighlights, setEditedHighlights] = useState<IHighlight[]>([]);

  const analysisPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const clipsPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Guards against re-emitting a completion event when the poll effect re-runs
  // (e.g. tab visibility toggles) after a project already reached a terminal state.
  const clipCompletionReportedRef = useRef<string | null>(null);
  const isDocumentVisible = useDocumentVisibility();
  const identityDefaults = useMemo(
    () => resolveStudioClipIdentityDefaults({ selectedBrand, settings }),
    [selectedBrand, settings],
  );

  useEffect(() => {
    if (identityDefaults.avatarId && !avatarId) {
      setAvatarId(identityDefaults.avatarId);
      setAvatarProvider(identityDefaults.avatarProvider);
    }

    if (identityDefaults.voiceId && !voiceId) {
      setVoiceId(identityDefaults.voiceId);
    }
  }, [
    avatarId,
    identityDefaults.avatarId,
    identityDefaults.avatarProvider,
    identityDefaults.voiceId,
    voiceId,
  ]);

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
        mode: generationMode,
        projectId: data.projectId,
        status: 'analyzing',
      });
      setStep('review');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [youtubeUrl, maxClips, minViralityScore, generationMode, clipsService]);

  // ─── Step 1: One-click YouTube clip factory ───────────────────
  const handleStartFromYoutube = useCallback(async () => {
    if (!youtubeUrl) {
      setError('YouTube URL is required.');
      return;
    }

    const quickAvatarId = avatarId || identityDefaults.avatarId;
    const quickVoiceId = voiceId || identityDefaults.voiceId;

    if (generationMode === 'avatar' && (!quickAvatarId || !quickVoiceId)) {
      setError(
        'Saved HeyGen avatar and voice defaults are required for one-click generation. Review highlights first to enter IDs manually.',
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    clipCompletionReportedRef.current = null;
    captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_STARTED, {
      generationType: GenerationType.CLIP,
    });

    try {
      const data = await clipsService.createFromYoutube({
        ...(generationMode === 'avatar'
          ? {
              avatarId: quickAvatarId,
              avatarProvider,
              voiceId: quickVoiceId,
            }
          : {}),
        language: 'en',
        maxClips,
        minViralityScore,
        mode: generationMode,
        youtubeUrl,
      });

      if (generationMode === 'avatar') {
        setAvatarId(quickAvatarId ?? '');
        setVoiceId(quickVoiceId ?? '');
      }
      setProject({
        clips: [],
        estimatedClips: data.estimatedClips,
        highlights: [],
        mode: generationMode,
        projectId: data.projectId,
        status: data.status ?? 'processing',
      });
      setSelectedIds(new Set());
      setEditedHighlights([]);
      setStep('progress');
    } catch (err: unknown) {
      captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
        generationType: GenerationType.CLIP,
        outcome: 'failure',
      });
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    youtubeUrl,
    avatarId,
    voiceId,
    identityDefaults.avatarId,
    identityDefaults.voiceId,
    generationMode,
    avatarProvider,
    maxClips,
    minViralityScore,
    clipsService,
  ]);

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
        const projectData = await clipsService
          .getProject(project.projectId, abortController.signal)
          .catch(() => ({}));

        if (cancelled) {
          return;
        }

        if (data.status === 'analyzed') {
          const highlights: IHighlight[] = data.highlights ?? [];
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  highlights,
                  referenceFrames:
                    projectData.referenceFrames ?? prev.referenceFrames,
                  status: 'analyzed',
                }
              : prev,
          );
          setEditedHighlights(highlights);
          setSelectedIds(new Set(highlights.map((h: IHighlight) => h.id)));
          clearPendingPoll();
        } else if (data.status === 'failed') {
          setProject((prev) => (prev ? { ...prev, status: 'failed' } : prev));
          clearPendingPoll();
        } else {
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  referenceFrames:
                    projectData.referenceFrames ?? prev.referenceFrames,
                }
              : prev,
          );
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
      if (analysisPollTimeoutRef.current) {
        clearTimeout(analysisPollTimeoutRef.current);
        analysisPollTimeoutRef.current = null;
      }
    };
  }, [
    step,
    project?.projectId,
    project?.status,
    clipsService,
    isDocumentVisible,
  ]);

  const handleSelectReferenceFrame = useCallback(
    async (candidateId: string) => {
      if (
        !project?.projectId ||
        candidateId === project.referenceFrames?.selectedCandidateId
      ) {
        return;
      }

      setPendingReferenceFrameId(candidateId);
      setFailedReferenceFrameId(candidateId);
      setReferenceFrameError(null);

      try {
        const referenceFrames = await clipsService.selectReferenceFrame(
          project.projectId,
          candidateId,
        );

        setProject((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            referenceFrames:
              referenceFrames ??
              (previous.referenceFrames
                ? {
                    ...previous.referenceFrames,
                    selectedCandidateId: candidateId,
                    status: 'selected',
                  }
                : undefined),
          };
        });
        setFailedReferenceFrameId(null);
      } catch {
        setReferenceFrameError(
          'Reference frame selection could not be saved. Try again.',
        );
      } finally {
        setPendingReferenceFrameId(null);
      }
    },
    [
      clipsService,
      project?.projectId,
      project?.referenceFrames?.selectedCandidateId,
    ],
  );

  const retryReferenceFrameSelection = useCallback(() => {
    if (failedReferenceFrameId) {
      void handleSelectReferenceFrame(failedReferenceFrameId);
    }
  }, [failedReferenceFrameId, handleSelectReferenceFrame]);

  // ─── Step 2: Generate selected highlights ─────────────────────
  const handleGenerate = useCallback(async () => {
    if (!project?.projectId) {
      setError('Clip project is required to generate clips.');
      return;
    }

    if (generationMode === 'avatar' && (!avatarId || !voiceId)) {
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
    clipCompletionReportedRef.current = null;
    captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_STARTED, {
      generationType: GenerationType.CLIP,
    });

    try {
      await clipsService.generateClips(project.projectId, {
        ...(generationMode === 'avatar'
          ? { avatarId, avatarProvider, voiceId }
          : {}),
        editedHighlights: selectedEditedHighlights.map((highlight) => ({
          id: highlight.id,
          summary: highlight.summary,
          title: highlight.title,
        })),
        mode: generationMode,
        selectedHighlightIds: ids,
      });

      setProject((prev) =>
        prev ? { ...prev, mode: generationMode, status: 'generating' } : prev,
      );
      setStep('progress');
    } catch (err: unknown) {
      clipCompletionReportedRef.current = project.projectId;
      captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
        generationType: GenerationType.CLIP,
        outcome: 'failure',
      });
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    project?.projectId,
    avatarId,
    voiceId,
    avatarProvider,
    generationMode,
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
          if (clipCompletionReportedRef.current !== project.projectId) {
            clipCompletionReportedRef.current = project.projectId;
            captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
              generationType: GenerationType.CLIP,
              outcome: projectStatus === 'failed' ? 'failure' : 'success',
            });
          }
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
      if (clipsPollTimeoutRef.current) {
        clearTimeout(clipsPollTimeoutRef.current);
        clipsPollTimeoutRef.current = null;
      }
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
    setPendingReferenceFrameId(null);
    setFailedReferenceFrameId(null);
    setReferenceFrameError(null);
  }, []);

  const selectedCount = selectedIds.size;

  return {
    avatarId,
    avatarProvider,
    clipsService,
    editedHighlights,
    error,
    generationMode,
    handleAnalyze,
    handleGenerate,
    handleSelectReferenceFrame,
    handleStartFromYoutube,
    identityDefaults,
    isSubmitting,
    maxClips,
    minViralityScore,
    pendingReferenceFrameId,
    project,
    referenceFrameError,
    resetToInput,
    retryReferenceFrameSelection,
    selectedCount,
    selectedIds,
    setAvatarId,
    setAvatarProvider,
    setGenerationMode,
    setMaxClips,
    setMinViralityScore,
    setVoiceId,
    setYoutubeUrl,
    step,
    toggleHighlight,
    updateHighlightScript,
    updateHighlightTitle,
    voiceId,
    youtubeUrl,
  };
}
