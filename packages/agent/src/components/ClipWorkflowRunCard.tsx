import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import {
  buildAgentGenerationRequestBody,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiOutlineArrowPathRoundedSquare,
  HiOutlineBolt,
  HiOutlineFilm,
  HiOutlinePlay,
  HiOutlineSparkles,
} from 'react-icons/hi2';

interface ClipWorkflowRunCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type StepKey =
  | 'trigger_workflow'
  | 'generate_clip'
  | 'merge_clips'
  | 'reframe_portrait'
  | 'supervised_review';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

const STEP_LABELS: Record<StepKey, string> = {
  generate_clip: 'Generate 30s landscape clip',
  merge_clips: 'Merge generated clips (optional)',
  reframe_portrait: 'Reframe to Instagram portrait',
  supervised_review: 'Open supervised review',
  trigger_workflow: 'Trigger workflow execution',
};

const STEP_ORDER: StepKey[] = [
  'trigger_workflow',
  'generate_clip',
  'merge_clips',
  'reframe_portrait',
  'supervised_review',
];

function toStepStatusClass(status: StepStatus): string {
  if (status === 'completed') return 'text-green-600';
  if (status === 'failed') return 'text-destructive';
  if (status === 'running') return 'text-primary';
  return 'text-muted-foreground';
}

export function ClipWorkflowRunCard({
  action,
  apiService,
}: ClipWorkflowRunCardProps): ReactElement {
  const { href } = useOrgUrl();
  const clipRun = action.clipRun ?? {};
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
    const execution = await runAgentApiEffect(
      apiService.triggerWorkflowEffect(
        workflowId,
        clipRun.inputValues ?? {
          confirmBeforePublish: true,
          duration: durationSeconds,
          format: 'landscape',
          intent: 'twitter_clip',
          mergeGeneratedVideos,
          prompt,
        },
      ),
    );
    setWorkflowExecutionId(execution.id);
    setStep('trigger_workflow', 'completed');
  }, [
    apiService,
    clipRun.inputValues,
    durationSeconds,
    mergeGeneratedVideos,
    prompt,
    setStep,
    workflowId,
  ]);

  const runGenerateClip = useCallback(async () => {
    setStep('generate_clip', 'running');
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
          modelKey: clipRun.model || undefined,
          promptId: promptDoc.id,
          promptText: prompt,
          waitForCompletion: true,
        }),
      ),
    );
    setGeneratedVideoIds((prev) => [...prev, result.id]);
    setStep('generate_clip', 'completed');
  }, [apiService, clipRun.model, durationSeconds, prompt, setStep]);

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

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <HiOutlineFilm className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Prompt</span>
          <textarea
            className="min-h-[72px] rounded border border-border bg-background p-2 text-sm text-foreground"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 rounded border border-border p-2">
            <input
              type="checkbox"
              checked={autonomousMode}
              onChange={(e) => setAutonomousMode(e.target.checked)}
            />
            Autonomous mode
          </label>
          <label className="flex items-center gap-2 rounded border border-border p-2">
            <input
              type="checkbox"
              checked={requireStepConfirmation}
              onChange={(e) => setRequireStepConfirmation(e.target.checked)}
            />
            Confirm each step
          </label>
          <label className="flex items-center gap-2 rounded border border-border p-2">
            <input
              type="checkbox"
              checked={mergeGeneratedVideos}
              onChange={(e) => {
                const checked = e.target.checked;
                setMergeGeneratedVideos(checked);
                setStep('merge_clips', checked ? 'pending' : 'skipped');
              }}
            />
            Merge multiple clips
          </label>
          <label className="flex items-center gap-2 rounded border border-border p-2">
            <span>Duration (s)</span>
            <input
              type="number"
              min={5}
              max={60}
              value={durationSeconds}
              onChange={(e) =>
                setDurationSeconds(
                  Math.max(5, Math.min(60, Number(e.target.value || 30))),
                )
              }
              className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-right"
            />
          </label>
        </div>

        {action.workflows != null && action.workflows.length > 0 && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Workflow</span>
            <select
              value={workflowId ?? ''}
              onChange={(e) => {
                const nextId = e.target.value || undefined;
                setWorkflowId(nextId);
                setStep('trigger_workflow', nextId ? 'pending' : 'skipped');
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">No workflow binding</option>
              {action.workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="rounded border border-border p-2.5">
          <p className="mb-2 text-xs font-medium text-foreground">Run Steps</p>
          <div className="space-y-1.5">
            {STEP_ORDER.map((step) => (
              <div
                key={step}
                className={`flex items-center justify-between text-xs ${toStepStatusClass(steps[step])}`}
              >
                <span>{STEP_LABELS[step]}</span>
                <span className="capitalize">{steps[step]}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <HiExclamationCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runNext}
            disabled={!nextNonPublishStep}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            <HiOutlinePlay className="h-3.5 w-3.5" />
            {nextNonPublishStep ? 'Run Next Step' : 'Pipeline Ready'}
          </button>

          <button
            type="button"
            onClick={addAnotherClip}
            className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium"
          >
            <HiOutlineBolt className="h-3.5 w-3.5" />
            Generate Another Clip
          </button>

          {canMerge && (
            <button
              type="button"
              onClick={() => runOneStep('merge_clips')}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium"
            >
              <HiOutlineArrowPathRoundedSquare className="h-3.5 w-3.5" />
              Merge Now
            </button>
          )}

          <button
            type="button"
            onClick={() => runOneStep('supervised_review')}
            disabled={
              steps.reframe_portrait !== 'completed' ||
              steps.supervised_review === 'completed'
            }
            className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <HiOutlineSparkles className="h-3.5 w-3.5" />
            Open Supervised Review
          </button>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Generated clips: {generatedVideoIds.length}</p>
          {workflowExecutionId && (
            <a
              className="block text-primary underline-offset-2 hover:underline"
              href={href(`/workflows/executions/${workflowExecutionId}`)}
            >
              View workflow execution →
            </a>
          )}
          {finalVideoId && (
            <a
              className="block text-primary underline-offset-2 hover:underline"
              href={`/g/video/${finalVideoId}`}
            >
              Open final asset →
            </a>
          )}
          {draftReviewUrl && (
            <a
              className="block text-primary underline-offset-2 hover:underline"
              href={draftReviewUrl}
            >
              Open draft handoff →
            </a>
          )}
          <a
            className="block text-primary underline-offset-2 hover:underline"
            href={href('/posts/review')}
          >
            Open human review queue →
          </a>
        </div>

        {steps.supervised_review === 'completed' && (
          <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            <HiCheckCircle className="h-4 w-4" />
            Handed off into the supervised publishing flow for human review.
          </div>
        )}
      </div>
    </div>
  );
}
