import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiOutlineBolt,
} from 'react-icons/hi2';

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
        <HiOutlineBolt className="size-4" />
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
        <div className="flex items-center gap-2 border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950">
          <HiCheckCircle className="size-4 text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300">
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
        <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950">
          <HiExclamationCircle className="size-4 text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-700 dark:text-red-300">
            {error}
          </span>
        </div>
        <Button
          variant={ButtonVariant.OUTLINE}
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
