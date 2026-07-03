import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ReactElement } from 'react';
import { HiExclamationCircle, HiOutlineFilm } from 'react-icons/hi2';
import { ClipWorkflowSettingsPanel } from './ClipWorkflowSettingsPanel';
import { ClipWorkflowStatusFooter } from './ClipWorkflowStatusFooter';
import { ClipWorkflowStepsList } from './ClipWorkflowStepsList';
import { useClipWorkflowRunCard } from './useClipWorkflowRunCard';

interface ClipWorkflowRunCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

function formatMissingIdentity(identity: AgentClipRunIdentity): string {
  return identity.missing.length > 0
    ? `Missing ${identity.missing.join(' and ')}`
    : 'Ready';
}

export function ClipWorkflowRunCard({
  action,
  apiService,
}: ClipWorkflowRunCardProps): ReactElement {
  const { href } = useOrgUrl();

  const {
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
    workflowExecutionUrl,
    humanReviewUrl,
  } = useClipWorkflowRunCard({ action, apiService, hrefFn: href });

  return (
    <div className="mt-2 overflow-hidden border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <HiOutlineFilm className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <ClipWorkflowSettingsPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          autonomousMode={autonomousMode}
          onAutonomousModeChange={setAutonomousMode}
          requireStepConfirmation={requireStepConfirmation}
          onRequireStepConfirmationChange={setRequireStepConfirmation}
          mergeGeneratedVideos={mergeGeneratedVideos}
          onMergeGeneratedVideosChange={(checked) => {
            setMergeGeneratedVideos(checked);
            setStep('merge_clips', checked ? 'pending' : 'skipped');
          }}
          durationSeconds={durationSeconds}
          onDurationSecondsChange={setDurationSeconds}
          workflows={action.workflows}
          workflowId={workflowId}
          onWorkflowIdChange={(nextId, status) => {
            setWorkflowId(nextId);
            setStep('trigger_workflow', status);
          }}
          nextNonPublishStep={nextNonPublishStep}
          canMerge={canMerge}
          steps={steps}
          onRunNext={runNext}
          onAddAnotherClip={addAnotherClip}
          onMergeNow={() => runOneStep('merge_clips')}
          onOpenSupervisedReview={() => runOneStep('supervised_review')}
        />

        {identity && (
          <div
            className={`border px-3 py-2 text-xs ${
              identity.isComplete
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300'
                : 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Clip identity</span>
              <span>{identity.label}</span>
            </div>
            <p className="mt-1 text-muted-foreground">
              {identity.isComplete
                ? `Avatar ${identity.avatarId} and voice ${identity.voiceId} are ready.`
                : formatMissingIdentity(identity)}
            </p>
          </div>
        )}

        <ClipWorkflowStepsList steps={steps} />

        {error && (
          <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <HiExclamationCircle className="size-4" />
            {error}
          </div>
        )}

        <ClipWorkflowStatusFooter
          generatedVideoIds={generatedVideoIds}
          workflowExecutionId={workflowExecutionId}
          finalVideoId={finalVideoId}
          draftReviewUrl={draftReviewUrl}
          supervisedReviewStatus={steps.supervised_review}
          workflowExecutionUrl={workflowExecutionUrl}
          humanReviewUrl={humanReviewUrl}
        />
      </div>
    </div>
  );
}
