import { AgentPlanReviewCard } from '@genfeedai/agent/components/AgentPlanReviewCard';
import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement, ReactNode } from 'react';

type AgentPlanReviewSectionProps = {
  plan: AgentProposedPlan;
  isBusy: boolean;
  activeUiAction: string | null;
  isCreatingFollowUpTasks: boolean;
  followUpTaskMessage: string | null;
  showFollowUpButton: boolean;
  onApprove: () => Promise<void>;
  onRequestChanges: (revisionNote: string) => Promise<void>;
  onCreateFollowUpTasks: () => Promise<void>;
};

export function AgentPlanReviewSection({
  plan,
  isBusy,
  activeUiAction,
  isCreatingFollowUpTasks,
  followUpTaskMessage,
  showFollowUpButton,
  onApprove,
  onRequestChanges,
  onCreateFollowUpTasks,
}: AgentPlanReviewSectionProps): ReactElement {
  const extraActions: ReactNode = showFollowUpButton ? (
    <Button
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
      onClick={() => {
        void onCreateFollowUpTasks();
      }}
      isDisabled={Boolean(activeUiAction) || isBusy || isCreatingFollowUpTasks}
      className="rounded-md px-4 py-2 text-sm"
    >
      {isCreatingFollowUpTasks ? 'Creating Tasks...' : 'Create Follow-up Tasks'}
    </Button>
  ) : null;

  return (
    <div className="mb-6">
      <AgentPlanReviewCard
        extraActions={extraActions}
        footerMessage={followUpTaskMessage}
        isBusy={Boolean(activeUiAction) || isBusy}
        plan={plan}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
      />
    </div>
  );
}
