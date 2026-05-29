import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiCurrencyDollar } from 'react-icons/hi2';

type WorkflowExecuteCardWorkflowInfoProps = {
  action: AgentUiAction;
  workflowName: string;
};

export function WorkflowExecuteCardWorkflowInfo({
  action,
  workflowName,
}: WorkflowExecuteCardWorkflowInfoProps): ReactElement {
  return (
    <>
      <div className="border border-border p-2.5">
        <span className="text-sm font-medium text-foreground">
          {workflowName}
        </span>
        {action.workflowDescription && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {action.workflowDescription}
          </p>
        )}
      </div>

      {action.description && (
        <p className="text-xs text-muted-foreground">{action.description}</p>
      )}

      {action.creditEstimate != null && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <HiCurrencyDollar className="size-3.5" />
          <span>Estimated cost: {action.creditEstimate} credits</span>
        </div>
      )}
    </>
  );
}
