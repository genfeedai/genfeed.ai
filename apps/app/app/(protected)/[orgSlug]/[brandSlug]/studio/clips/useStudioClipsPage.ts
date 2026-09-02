import { useBrand } from '@contexts/user/brand-context/brand-context';
import { GenerationType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  type ClipProcessingFlow,
  type ClipProjectReadResponse,
  type ClipSourceKind,
  type IBrand,
  type IOrganizationSetting,
  isClipResultMode,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useDocumentVisibility } from '@hooks/ui/use-document-visibility/use-document-visibility';
import type {
  AvatarProvider,
  ClipResultMode,
  ClipsStep,
  IHighlight,
  ProjectState,
} from '@props/studio/clips.props';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { ClipsApiService } from './services/clips-api.service';

const TERMINAL_PROJECT_STATUSES = new Set([
  'completed',
  'failed',
  'partially-completed',
]);

type StudioClipIdentityField = 'avatar' | 'voice';
type StudioClipIdentitySource =
  | 'brand'
  | 'explicit'
  | 'missing'
  | 'organization';

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
  settings?: Pick<
    IOrganizationSetting,
    'defaultVoiceId' | 'defaultVoiceProvider' | 'defaultVoiceRef'
  > | null;
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

/**
 * Mirrors the API's legacy voice fallback (`defaultVoiceProvider` +
 * `defaultVoiceId`) so a brand configured that way is not blocked locally
 * before the server resolver ever runs.
 */
function resolveHeygenVoiceFallback(
  provider?: string | null,
  voiceId?: string | null,
): string | undefined {
  return isHeygenProvider(provider) ? readNonEmptyString(voiceId) : undefined;
}

export function resolveStudioClipIdentityDefaults({
  selectedBrand,
  settings,
}: StudioClipIdentityContext): StudioClipIdentityDefaults {
  const brandConfig = selectedBrand?.agentConfig;
  const brandAvatarId = readNonEmptyString(brandConfig?.heygenAvatarId);
  const brandVoiceId =
    readNonEmptyString(brandConfig?.heygenVoiceId) ??
    resolveHeygenVoiceRef(brandConfig?.defaultVoiceRef) ??
    resolveHeygenVoiceFallback(
      brandConfig?.defaultVoiceProvider,
      brandConfig?.defaultVoiceId,
    );
  const organizationVoiceId =
    resolveHeygenVoiceRef(settings?.defaultVoiceRef) ??
    resolveHeygenVoiceFallback(
      settings?.defaultVoiceProvider,
      settings?.defaultVoiceId,
    );
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

export function resolveQuickAvatarIdentity({
  avatarId,
  avatarProvider,
  identityDefaults,
  voiceId,
}: {
  avatarId: string;
  avatarProvider: AvatarProvider;
  identityDefaults: StudioClipIdentityDefaults;
  voiceId: string;
}): { avatarId?: string; voiceId?: string } {
  const usesIdentityDefaults =
    avatarProvider === identityDefaults.avatarProvider;

  return {
    avatarId:
      avatarId ||
      (usesIdentityDefaults ? identityDefaults.avatarId : undefined),
    voiceId:
      voiceId || (usesIdentityDefaults ? identityDefaults.voiceId : undefined),
  };
}

export function resolveAvatarProviderSelection({
  avatarProvider,
  identityDefaults,
  provider,
}: {
  avatarProvider: AvatarProvider;
  identityDefaults: StudioClipIdentityDefaults;
  provider: AvatarProvider;
}): { avatarId: string; voiceId: string } | null {
  if (provider === avatarProvider) {
    return null;
  }

  return provider === identityDefaults.avatarProvider
    ? {
        avatarId: identityDefaults.avatarId ?? '',
        voiceId: identityDefaults.voiceId ?? '',
      }
    : { avatarId: '', voiceId: '' };
}

const PROGRESS_STATUSES = new Set([
  'captioning',
  'clipping',
  'completed',
  'failed',
  'generating',
  'partially-completed',
]);

export function resolveClipsStepFromStatus(status?: string): ClipsStep {
  if (status && PROGRESS_STATUSES.has(status)) {
    return 'progress';
  }

  return 'review';
}

export function useStudioClipsPage(options?: { projectId?: string }) {
  const projectIdFromRoute = options?.projectId;
  const { getToken } = useAuthIdentity();
  const { selectedBrand, settings } = useBrand();
  const router = useRouter();
  const { href } = useOrgUrl();

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveAuthToken(getToken)) ?? '';
  }, [getToken]);

  const clipsService = useMemo(
    () => new ClipsApiService(resolveToken),
    [resolveToken],
  );

  const goToProject = useCallback(
    (projectId: string) => {
      router.push(href(`${APP_ROUTES.STUDIO.CLIPS}/${projectId}`));
    },
    [href, router],
  );

  // Step tracking
  const [step, setStep] = useState<ClipsStep>(
    projectIdFromRoute ? 'review' : 'input',
  );

  // Form state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [sourceKind, setSourceKind] = useState<ClipSourceKind>('youtube');
  const [sourceFile, setSourceFileState] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [avatarProvider, setAvatarProvider] =
    useState<AvatarProvider>('heygen');
  const [generationMode, setGenerationMode] =
    useState<ClipResultMode>('avatar');
  const [maxClips, setMaxClips] = useState(10);
  const [minViralityScore, setMinViralityScore] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydrating, setIsHydrating] = useState(Boolean(projectIdFromRoute));
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

  const selectAvatarProvider = useCallback(
    (provider: AvatarProvider) => {
      const selection = resolveAvatarProviderSelection({
        avatarProvider,
        identityDefaults,
        provider,
      });
      if (!selection) {
        return;
      }

      setAvatarProvider(provider);
      setAvatarId(selection.avatarId);
      setVoiceId(selection.voiceId);
    },
    [avatarProvider, identityDefaults],
  );

  useEffect(() => {
    if (
      avatarProvider === identityDefaults.avatarProvider &&
      identityDefaults.avatarId &&
      !avatarId
    ) {
      setAvatarId(identityDefaults.avatarId);
      setAvatarProvider(identityDefaults.avatarProvider);
    }

    if (
      avatarProvider === identityDefaults.avatarProvider &&
      identityDefaults.voiceId &&
      !voiceId
    ) {
      setVoiceId(identityDefaults.voiceId);
    }
  }, [
    avatarId,
    avatarProvider,
    identityDefaults.avatarId,
    identityDefaults.avatarProvider,
    identityDefaults.voiceId,
    voiceId,
  ]);

  useEffect(() => {
    if (!projectIdFromRoute) {
      setIsHydrating(false);
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    setIsHydrating(true);

    void (async () => {
      const data = await clipsService.getProject(
        projectIdFromRoute,
        abortController.signal,
      );
      const hookApproval = await clipsService.getHookApproval(
        projectIdFromRoute,
        abortController.signal,
      );
      const highlightsResponse =
        data.status === 'analyzed'
          ? await clipsService.getHighlights(
              projectIdFromRoute,
              abortController.signal,
            )
          : null;
      return [data, hookApproval, highlightsResponse] as const;
    })()
      .then(([data, hookApproval, highlightsResponse]) => {
        if (cancelled) {
          return;
        }

        const status = data.status ?? 'pending';
        const mode = isClipResultMode(data.settings?.mode)
          ? data.settings.mode
          : 'avatar';
        const highlights = highlightsResponse?.highlights ?? [];

        setProject({
          clips: [],
          highlights,
          hookApproval,
          mode,
          projectId: projectIdFromRoute,
          referenceFrames: data.referenceFrames,
          source: data.source,
          status,
        });
        setEditedHighlights(highlights);
        setSelectedIds(new Set(highlights.map((highlight) => highlight.id)));
        setGenerationMode(mode);
        setStep(resolveClipsStepFromStatus(status));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Could not load this project.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsHydrating(false);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [clipsService, projectIdFromRoute]);

  const setSourceFile = useCallback((file: File | null) => {
    setSourceFileState(file);
    setUploadProgress(0);
    if (file?.type.startsWith('audio/')) {
      setGenerationMode('avatar');
    }
  }, []);

  const startUploadedSource = useCallback(
    async (flow: ClipProcessingFlow) => {
      if (!sourceFile) {
        throw new Error('Choose an audio or video file.');
      }

      const { avatarId: quickAvatarId, voiceId: quickVoiceId } =
        resolveQuickAvatarIdentity({
          avatarId,
          avatarProvider,
          identityDefaults,
          voiceId,
        });

      if (
        flow === 'quick' &&
        generationMode === 'avatar' &&
        (!quickAvatarId || !quickVoiceId)
      ) {
        throw new Error(
          'Saved HeyGen avatar and voice defaults are required for one-click generation. Review highlights first to enter IDs manually.',
        );
      }

      const prepared = await clipsService.prepareUpload({
        ...(generationMode === 'avatar'
          ? {
              avatarId: quickAvatarId,
              avatarProvider,
              voiceId: quickVoiceId,
            }
          : {}),
        brandId: selectedBrand?.id,
        contentType: sourceFile.type || 'video/mp4',
        filename: sourceFile.name,
        flow,
        language: 'en',
        maxClips,
        minViralityScore,
        mode: generationMode,
        sizeBytes: sourceFile.size,
      });

      await clipsService.uploadSource(
        prepared.uploadUrl,
        sourceFile,
        setUploadProgress,
      );
      const started = await clipsService.finalizeUpload(prepared.projectId);

      if (flow === 'review') {
        goToProject(prepared.projectId);
        return;
      }

      const persistedProject = await clipsService.getProject(
        prepared.projectId,
      );

      setProject({
        clips: [],
        estimatedClips: started.estimatedClips,
        highlights: [],
        mode: generationMode,
        projectId: prepared.projectId,
        source: persistedProject.source,
        status: started.status,
      });
      setSelectedIds(new Set());
      setEditedHighlights([]);
      setStep('progress');
      goToProject(prepared.projectId);
    },
    [
      avatarId,
      avatarProvider,
      clipsService,
      generationMode,
      goToProject,
      identityDefaults,
      maxClips,
      minViralityScore,
      selectedBrand?.id,
      sourceFile,
      voiceId,
    ],
  );

  // ─── Step 1: Analyze ─────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (sourceKind === 'youtube' && !youtubeUrl) {
      setError('YouTube URL is required.');
      return;
    }
    if (sourceKind === 'upload' && !sourceFile) {
      setError('Choose an audio or video file.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (sourceKind === 'upload') {
        await startUploadedSource('review');
        return;
      }
      const data = await clipsService.analyzeVideo({
        brandId: selectedBrand?.id,
        language: 'en',
        maxClips,
        minViralityScore,
        youtubeUrl,
      });

      goToProject(data.projectId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    youtubeUrl,
    sourceFile,
    sourceKind,
    selectedBrand?.id,
    maxClips,
    minViralityScore,
    clipsService,
    goToProject,
    startUploadedSource,
  ]);

  // ─── Step 1: One-click YouTube clip factory ───────────────────
  const handleStartFromYoutube = useCallback(async () => {
    if (sourceKind === 'youtube' && !youtubeUrl) {
      setError('YouTube URL is required.');
      return;
    }
    if (sourceKind === 'upload' && !sourceFile) {
      setError('Choose an audio or video file.');
      return;
    }

    const { avatarId: quickAvatarId, voiceId: quickVoiceId } =
      resolveQuickAvatarIdentity({
        avatarId,
        avatarProvider,
        identityDefaults,
        voiceId,
      });

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
      clipFlow: 'quick',
      clipMode: generationMode,
      clipSourceKind: sourceKind,
      generationType: GenerationType.CLIP,
    });

    try {
      if (sourceKind === 'upload') {
        await startUploadedSource('quick');
        return;
      }
      const data = await clipsService.createFromYoutube({
        ...(generationMode === 'avatar'
          ? {
              avatarId: quickAvatarId,
              avatarProvider,
              voiceId: quickVoiceId,
            }
          : {}),
        brandId: selectedBrand?.id,
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
      goToProject(data.projectId);
    } catch (err: unknown) {
      captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
        clipFlow: 'quick',
        clipMode: generationMode,
        clipSourceKind: sourceKind,
        generationType: GenerationType.CLIP,
        outcome: 'failure',
      });
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    youtubeUrl,
    sourceFile,
    sourceKind,
    avatarId,
    voiceId,
    identityDefaults,
    selectedBrand?.id,
    generationMode,
    avatarProvider,
    maxClips,
    minViralityScore,
    clipsService,
    goToProject,
    startUploadedSource,
  ]);

  // ─── Poll for analysis completion ─────────────────────────────
  useEffect(() => {
    if (step !== 'review' || !project?.projectId) return;
    if (project.status === 'failed') return;
    if (project.status === 'analyzed' && project.highlights.length > 0) return;
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
          .catch((): ClipProjectReadResponse => ({}));

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
    project?.highlights.length,
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
      } catch (err: unknown) {
        setReferenceFrameError(
          err instanceof Error && err.message
            ? err.message
            : 'Reference frame selection could not be saved. Try again.',
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

  const handleRetrySource = useCallback(async () => {
    if (!project?.projectId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await clipsService.retrySource(project.projectId);
      setProject((previous) =>
        previous
          ? {
              ...previous,
              source: previous.source
                ? {
                    ...previous.source,
                    failure: null,
                    retryCount: previous.source.retryCount + 1,
                    status: 'queued',
                    updatedAt: new Date().toISOString(),
                  }
                : undefined,
              status: 'pending',
            }
          : previous,
      );
    } catch (retryError: unknown) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'The source could not be retried.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [clipsService, project?.projectId]);

  const handleRetryFailedClips = useCallback(async () => {
    if (!project?.projectId) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await clipsService.retryFailedClips(project.projectId);
      clipCompletionReportedRef.current = null;
      setProject((previous) =>
        previous ? { ...previous, status: 'generating' } : previous,
      );
    } catch (retryError: unknown) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'Failed clips could not be retried.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [clipsService, project?.projectId]);

  // ─── Step 2: Generate selected highlights ─────────────────────
  const handleGenerate = useCallback(async () => {
    if (!project?.projectId) {
      setError('Clip project is required to generate clips.');
      return;
    }

    if (
      generationMode === 'avatar' &&
      avatarProvider !== 'genfeedai' &&
      (!avatarId || !voiceId)
    ) {
      setError('Avatar ID and Voice ID are required to generate clips.');
      return;
    }

    if (
      generationMode === 'avatar' &&
      avatarProvider === 'genfeedai' &&
      !project.referenceFrames?.selectedCandidateId
    ) {
      setError('Select a reference frame for managed GenfeedAI generation.');
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
      clipFlow: 'review',
      clipMode: generationMode,
      clipSourceKind: project.source?.kind ?? 'youtube',
      generationType: GenerationType.CLIP,
    });

    try {
      await clipsService.generateClips(project.projectId, {
        ...(generationMode === 'avatar'
          ? {
              avatarProvider,
              ...(avatarProvider === 'genfeedai' ? {} : { avatarId, voiceId }),
            }
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
        clipFlow: 'review',
        clipMode: generationMode,
        clipSourceKind: project.source?.kind ?? 'youtube',
        generationType: GenerationType.CLIP,
        outcome: 'failure',
      });
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    project?.projectId,
    project?.source?.kind,
    project?.referenceFrames?.selectedCandidateId,
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
        const projectData = await clipsService.getProject(
          project.projectId,
          abortController.signal,
        );
        const [clips, hookApproval] = await Promise.all([
          clipsService.getClipResults(
            project.projectId,
            abortController.signal,
          ),
          clipsService.getHookApproval(
            project.projectId,
            abortController.signal,
          ),
        ]);

        if (cancelled) {
          return;
        }

        const projectStatus = projectData.status ?? 'generating';

        setProject((prev) =>
          prev
            ? {
                ...prev,
                clips,
                hookApproval,
                source: projectData.source ?? prev.source,
                status: projectStatus,
              }
            : prev,
        );

        if (TERMINAL_PROJECT_STATUSES.has(projectStatus)) {
          clearPendingPoll();
          if (clipCompletionReportedRef.current !== project.projectId) {
            clipCompletionReportedRef.current = project.projectId;
            captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
              clipFlow: project.source?.flow ?? 'quick',
              clipMode: project.mode,
              clipSourceKind: project.source?.kind ?? 'youtube',
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
  }, [
    step,
    project?.projectId,
    project?.mode,
    project?.source?.flow,
    project?.source?.kind,
    clipsService,
    isDocumentVisible,
  ]);

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
    setSourceFileState(null);
    setUploadProgress(0);
    router.push(href(APP_ROUTES.STUDIO.CLIPS));
  }, [href, router]);

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
    handleRetryFailedClips,
    handleRetrySource,
    handleSelectReferenceFrame,
    handleStartFromYoutube,
    identityDefaults,
    isHydrating,
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
    setAvatarProvider: selectAvatarProvider,
    setGenerationMode,
    setMaxClips,
    setMinViralityScore,
    setSourceFile,
    setSourceKind,
    setVoiceId,
    setYoutubeUrl,
    step,
    sourceFile,
    sourceKind,
    toggleHighlight,
    updateHighlightScript,
    updateHighlightTitle,
    voiceId,
    youtubeUrl,
    uploadProgress,
  };
}
