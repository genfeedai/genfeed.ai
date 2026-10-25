import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentClipperRunIdentity } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Film } from 'lucide-react';
import type { ReactElement } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';
import { ClipperWorkflowSettingsPanel } from './ClipperWorkflowSettingsPanel';
import { ClipperWorkflowStatusFooter } from './ClipperWorkflowStatusFooter';
import { ClipperWorkflowStepsList } from './ClipperWorkflowStepsList';
import { useClipperWorkflowRunCard } from './useClipperWorkflowRunCard';

interface ClipperWorkflowRunCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

function formatMissingIdentity(identity: AgentClipperRunIdentity): string {
  return identity.missing.length > 0
    ? `Missing ${identity.missing.join(' and ')}`
    : 'Ready';
}

export function ClipperWorkflowRunCard({
  action,
  apiService,
}: ClipperWorkflowRunCardProps): ReactElement {
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
    finalVideoUrl,
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
  } = useClipperWorkflowRunCard({ action, apiService, hrefFn: href });

  return (
    <div className="mt-2 overflow-hidden border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Film className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <ClipperWorkflowSettingsPanel
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
                ? 'border-success/20 bg-success/10 text-success   '
                : 'border-warning/20 bg-warning/10 text-warning   '
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

        <ClipperWorkflowStepsList steps={steps} />

        {error && <AgentErrorMessage message={error} className="text-xs" />}

        <ClipperWorkflowStatusFooter
          generatedVideoIds={generatedVideoIds}
          workflowExecutionId={workflowExecutionId}
          finalVideoUrl={finalVideoUrl}
          draftReviewUrl={draftReviewUrl}
          supervisedReviewStatus={steps.supervised_review}
          workflowExecutionUrl={workflowExecutionUrl}
          humanReviewUrl={humanReviewUrl}
        />
      </div>
    </div>
  );
}
