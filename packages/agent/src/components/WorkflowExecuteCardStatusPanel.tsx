import { ButtonVariant } from '@genfeedai/contracts';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Zap } from 'lucide-react';
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
      <GenerationStatus
        status="generating"
        label="Executing workflow…"
        className="border border-border"
      />
    );
  }

  if (status === 'done') {
    return (
      <div className="space-y-2">
        <Alert size="sm" variant="success">
          Workflow executed successfully
        </Alert>
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
