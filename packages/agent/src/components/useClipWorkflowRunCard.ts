import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildAgentGenerationRequestBody,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import { COMPOSE_ROUTES } from '@genfeedai/constants';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';
import { useCallback, useMemo, useState } from 'react';

export type StepKey =
  | 'trigger_workflow'
  | 'generate_clip'
  | 'merge_clips'
  | 'reframe_portrait'
  | 'supervised_review';
export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export const STEP_ORDER: StepKey[] = [
  'trigger_workflow',
  'generate_clip',
  'merge_clips',
  'reframe_portrait',
  'supervised_review',
];

interface UseClipWorkflowRunCardParams {
  action: AgentUiAction;
  apiService: AgentApiService;
  hrefFn: (path: string) => string;
}

function buildClipIdentityInputValues(
  identity?: AgentClipRunIdentity,
): Record<string, unknown> {
  if (!identity) {
    return {};
  }

  return {
    avatarId: identity.avatarId,
    avatarProvider: identity.avatarProvider,
    heygenAvatarId:
      (identity.avatarProvider ?? 'heygen') === 'heygen'
        ? identity.avatarId
        : undefined,
    heygenVoiceId:
      (identity.voiceProvider ?? 'heygen') === 'heygen'
        ? identity.voiceId
        : undefined,
    identitySource: identity.source,
    missingIdentity: identity.missing,
    useIdentity: identity.useIdentity,
    voiceId: identity.voiceId,
    voiceProvider: identity.voiceProvider,
  };
}

function getClipIdentityError(identity: AgentClipRunIdentity): string {
  if (identity.isComplete) {
    return '';
  }

  const missing = identity.missing.join(' and ');
  return `Configure saved ${missing} defaults or enter explicit IDs before generating clips.`;
}

export function useClipWorkflowRunCard({
  action,
  apiService,
  hrefFn,
}: UseClipWorkflowRunCardParams) {
  const clipRun = action.clipRun ?? {};
  const identity = clipRun.identity;
  const [autonomousMode, setAutonomousMode] = useState(
    clipRun.autonomousMode ?? true,
  );
  const [requireStepConfirmation, setRequireStepConfirmation] = useState(
    clipRun.requireStepConfirmation ?? true,
  );
  const [mergeGeneratedVideos, setMergeGeneratedVideos] = useState(
    clipRun.mergeGeneratedVideos ?? true,
  );
  const [prompt, setPrompt] = useState(
    clipRun.prompt ?? action.description ?? 'Create a 30-second X clip',
  );
  const [durationSeconds, setDurationSeconds] = useState(
    clipRun.durationSeconds ?? 30,
  );
  const [workflowId, setWorkflowId] = useState<string | undefined>(
    action.workflowId ?? action.workflows?.[0]?.id,
  );
  const [workflowExecutionId, setWorkflowExecutionId] = useState<string | null>(
    null,
  );
  const [generatedVideoIds, setGeneratedVideoIds] = useState<string[]>([]);
  const [mergedVideoId, setMergedVideoId] = useState<string | null>(null);
  const [portraitVideoId, setPortraitVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeThread = useAgentChatStore((state) =>
    state.threads.find((thread) => thread.id === state.activeThreadId),
  );
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>({
    generate_clip: 'pending',
    merge_clips: mergeGeneratedVideos ? 'pending' : 'skipped',
    reframe_portrait: 'pending',
    supervised_review: 'pending',
    trigger_workflow: workflowId ? 'pending' : 'skipped',
  });

  const finalVideoId = portraitVideoId ?? mergedVideoId ?? generatedVideoIds[0];
  const canMerge = mergeGeneratedVideos && generatedVideoIds.length > 1;

  const draftReviewUrl = useMemo(() => {
    if (!finalVideoId) {
      return null;
    }

    const params = new URLSearchParams({
      description: prompt,
      ingredientId: finalVideoId,
      title: action.title || 'Generated clip draft',
    });

    return `${COMPOSE_ROUTES.POST}?${params.toString()}`;
  }, [action.title, finalVideoId, prompt]);

  const setStep = useCallback((key: StepKey, status: StepStatus) => {
    setSteps((prev) => ({ ...prev, [key]: status }));
  }, []);

  const runTriggerWorkflow = useCallback(async () => {
    if (!workflowId) {
      setStep('trigger_workflow', 'skipped');
      return;
    }
    setStep('trigger_workflow', 'running');
    if (identity && !identity.isComplete) {
      throw new Error(getClipIdentityError(identity));
    }

    const inputValues = {
      ...(clipRun.inputValues ?? {
        confirmBeforePublish: true,
        duration: durationSeconds,
        format: 'landscape',
        intent: 'twitter_clip',
        mergeGeneratedVideos,
        prompt,
      }),
      ...buildClipIdentityInputValues(identity),
    };

    const execution = await runAgentApiEffect(
      apiService.triggerWorkflowEffect(
        workflowId,
        inputValues,
        undefined,
        activeThreadId && activeThread?.contextVersion !== undefined
          ? {
              expectedContextVersion: activeThread.contextVersion,
              threadId: activeThreadId,
            }
          : undefined,
      ),
    );
    setWorkflowExecutionId(execution.id);
    setStep('trigger_workflow', 'completed');
  }, [
    activeThread?.contextVersion,
    activeThreadId,
    apiService,
    clipRun.inputValues,
    durationSeconds,
    identity,
    mergeGeneratedVideos,
    prompt,
    setStep,
    workflowId,
  ]);

  const runGenerateClip = useCallback(async () => {
    setStep('generate_clip', 'running');
    if (identity && !identity.isComplete) {
      throw new Error(getClipIdentityError(identity));
    }

    const promptDoc = await runAgentApiEffect(
      apiService.createPromptEffect({
        category: getPromptCategoryForGenerationType('video'),
        duration: Math.max(5, Math.min(60, durationSeconds)),
        isSkipEnhancement: true,
        model: clipRun.model || undefined,
        original: prompt,
      }),
    );
    const result = await runAgentApiEffect(
      apiService.generateIngredientEffect(
        'video',
        buildAgentGenerationRequestBody({
          aspectRatio: '16:9',
          duration: Math.max(5, Math.min(60, durationSeconds)),
          identity,
          modelKey: clipRun.model || undefined,
          promptId: promptDoc.id,
          promptText: prompt,
          waitForCompletion: true,
        }),
      ),
    );
    setGeneratedVideoIds((prev) => [...prev, result.id]);
    setStep('generate_clip', 'completed');
  }, [apiService, clipRun.model, durationSeconds, identity, prompt, setStep]);

  const runMerge = useCallback(async () => {
    if (!mergeGeneratedVideos || generatedVideoIds.length < 2) {
      setStep('merge_clips', mergeGeneratedVideos ? 'pending' : 'skipped');
      return;
    }
    setStep('merge_clips', 'running');
    const result = await runAgentApiEffect(
      apiService.mergeVideosEffect(generatedVideoIds, {
        isMuteVideoAudio: true,
        transition: 'none',
        transitionDuration: 0.5,
      }),
    );
    setMergedVideoId(result.id);
    setStep('merge_clips', 'completed');
  }, [apiService, generatedVideoIds, mergeGeneratedVideos, setStep]);

  const runReframe = useCallback(async () => {
    const sourceVideoId =
      mergedVideoId ?? generatedVideoIds[generatedVideoIds.length - 1];
    if (!sourceVideoId) {
      throw new Error('No source video available for reframe');
    }
    setStep('reframe_portrait', 'running');
    try {
      const result = await runAgentApiEffect(
        apiService.reframeVideoEffect(sourceVideoId, {
          format: 'portrait',
          height: 1920,
          prompt,
          width: 1080,
        }),
      );
      setPortraitVideoId(result.id);
    } catch {
      const fallback = await runAgentApiEffect(
        apiService.resizeVideoEffect(sourceVideoId, 1080, 1920),
      );
      setPortraitVideoId(fallback.id);
    }
    setStep('reframe_portrait', 'completed');
  }, [apiService, generatedVideoIds, mergedVideoId, prompt, setStep]);

  const runSupervisedReview = useCallback(async () => {
    if (!finalVideoId) {
      throw new Error('No final clip is ready for supervised review yet');
    }

    setStep('supervised_review', 'running');
    let nextUrl = draftReviewUrl;

    if (action.brandId) {
      const batch = await runAgentApiEffect(
        apiService.createManualReviewBatchEffect({
          brandId: action.brandId,
          items: [
            {
              caption: prompt,
              format: 'video',
              ingredientId: finalVideoId,
              label: action.title || 'Generated clip draft',
              platform: action.platform,
              prompt,
              sourceActionId: action.id,
              sourceWorkflowId: action.workflowId,
              sourceWorkflowName: action.workflowName,
            },
          ],
        }),
      );
      const firstItemId = batch.items[0]?.id;
      const params = new URLSearchParams({ batch: batch.id });
      if (firstItemId) {
        params.set('item', firstItemId);
      }
      nextUrl = `/posts/review?${params.toString()}`;
    }

    setStep('supervised_review', 'completed');

    if (typeof window !== 'undefined') {
      window.location.href = nextUrl ?? '/posts/review';
    }
  }, [
    action.brandId,
    action.id,
    action.platform,
    action.title,
    action.workflowId,
    action.workflowName,
    apiService,
    draftReviewUrl,
    finalVideoId,
    prompt,
    setStep,
  ]);

  const runOneStep = useCallback(
    async (key: StepKey) => {
      try {
        setError(null);
        if (key === 'trigger_workflow') await runTriggerWorkflow();
        if (key === 'generate_clip') await runGenerateClip();
        if (key === 'merge_clips') await runMerge();
        if (key === 'reframe_portrait') await runReframe();
        if (key === 'supervised_review') await runSupervisedReview();
      } catch (err: unknown) {
        setStep(key, 'failed');
        setError(err instanceof Error ? err.message : `Failed at ${key}`);
      }
    },
    [
      runGenerateClip,
      runMerge,
      runReframe,
      runSupervisedReview,
      runTriggerWorkflow,
      setStep,
    ],
  );

  const nextNonPublishStep = useMemo(
    () =>
      STEP_ORDER.find(
        (s) =>
          s !== 'supervised_review' &&
          (steps[s] === 'pending' || steps[s] === 'failed'),
      ),
    [steps],
  );

  const runNext = useCallback(async () => {
    const step = nextNonPublishStep;
    if (!step) return;
    await runOneStep(step);
    if (autonomousMode && !requireStepConfirmation) {
      const next = STEP_ORDER.find(
        (s) =>
          s !== 'supervised_review' &&
          (steps[s] === 'pending' || steps[s] === 'failed'),
      );
      if (next && next !== step) {
        await runOneStep(next);
      }
    }
  }, [
    autonomousMode,
    nextNonPublishStep,
    requireStepConfirmation,
    runOneStep,
    steps,
  ]);

  const addAnotherClip = useCallback(async () => {
    await runOneStep('generate_clip');
    if (mergeGeneratedVideos) {
      setStep('merge_clips', 'pending');
    }
    setStep('reframe_portrait', 'pending');
    setStep('supervised_review', 'pending');
    setMergedVideoId(null);
    setPortraitVideoId(null);
  }, [mergeGeneratedVideos, runOneStep, setStep]);

  return {
    autonomousMode,
    setAutonomousMode,
    requireStepConfirmation,
    setRequireStepConfirmation,
    mergeGeneratedVideos,
    setMergeGeneratedVideos,
    prompt,
    setPrompt,
    durationSeconds,
    setDurationSeconds,
    workflowId,
    setWorkflowId,
    workflowExecutionId,
    generatedVideoIds,
    finalVideoId,
    identity,
    canMerge,
    draftReviewUrl,
    error,
    steps,
    setStep,
    nextNonPublishStep,
    runNext,
    runOneStep,
    addAnotherClip,
    workflowExecutionUrl: hrefFn(
      `/workflows/executions/${workflowExecutionId ?? ''}`,
    ),
    humanReviewUrl: hrefFn('/posts/review'),
  };
}
