import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import Spinner from '@ui/primitives/spinner';
import { MessageSquare, TriangleAlert } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

interface AgentThreadListEmptyStateProps {
  /**
   * List actions normally ride a section header. With no threads there is no
   * section, so they render here — otherwise the archived view becomes
   * unreachable from an empty list.
   */
  actions?: ReactNode;
  isLoading: boolean;
  shouldShowLoadFailureState: boolean;
  shouldShowEmptyState: boolean;
  onRetry: () => void;
}

export function AgentThreadListEmptyState({
  actions,
  isLoading,
  shouldShowLoadFailureState,
  shouldShowEmptyState,
  onRetry,
}: AgentThreadListEmptyStateProps): ReactElement | null {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="size-4 text-primary" />
      </div>
    );
  }

  if (shouldShowLoadFailureState) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-warning/10 ring-1 ring-inset ring-orange-500/20">
          <TriangleAlert className="size-5 text-warning/80" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground/70">
            Failed to load threads
          </p>
          <p className="text-xs text-muted-foreground">
            Check your connection and try again.
          </p>
        </div>
        <Button
          withWrapper={false}
          variant={ButtonVariant.SECONDARY}
          className="h-8 px-3 text-xs"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (shouldShowEmptyState) {
    return (
      <div className="relative">
        {actions ? (
          <div className="absolute right-2 top-2">{actions}</div>
        ) : null}
        <EmptyState
          icon={MessageSquare}
          title="No threads"
          description="Start one to get going"
        />
      </div>
    );
  }

  return null;
}
