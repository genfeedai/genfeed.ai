import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { CircleCheck, Zap } from 'lucide-react';
import type { ReactElement } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

type CardStatus = 'idle' | 'executing' | 'done' | 'error';

type WorkflowExecuteCardStatusPanelProps = {
  status: CardStatus;
  error: string | null;
  executionId: string | null;
  workflowId: string | undefined;
  isLoadingInterface: boolean;
  executionHref: string | null;
  onExecute: () => void;
  onRetry: () => void;
};

export function WorkflowExecuteCardStatusPanel({
  status,
  error,
  executionId,
  workflowId,
  isLoadingInterface,
  executionHref,
  onExecute,
  onRetry,
}: WorkflowExecuteCardStatusPanelProps): ReactElement | null {
  if (status === 'idle') {
    return (
      <Button
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
        onClick={onExecute}
        isDisabled={!workflowId || isLoadingInterface}
        className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-black"
      >
        <Zap className="size-4" />
        Execute
      </Button>
    );
  }

  if (status === 'executing') {
    return (
      <div className="flex items-center justify-center gap-2 border border-border px-4 py-3">
        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">
          Executing workflow…
        </span>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 border border-success/20 bg-success/10 px-3 py-2  ">
          <CircleCheck className="size-4 text-success " />
          <span className="text-sm text-success ">
            Workflow executed successfully
          </span>
        </div>
        {executionId && executionHref && (
          <a
            href={executionHref}
            className="flex w-full items-center justify-center gap-1 border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            View Execution
          </a>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-2">
        <AgentErrorMessage message={error ?? 'Workflow execution failed'} />
        <Button
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={onRetry}
          className="flex w-full items-center justify-center px-4 py-2 text-sm font-black"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return null;
}
