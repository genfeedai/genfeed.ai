import { ButtonVariant } from '@genfeedai/contracts';
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
      <EmptyState
        action={{
          label: 'Retry',
          onClick: onRetry,
          variant: ButtonVariant.SECONDARY,
        }}
        description="Check your connection and try again."
        icon={TriangleAlert}
        title="Failed to load threads"
      />
    );
  }

  if (shouldShowEmptyState) {
    return (
      <div className="relative">
        {actions ? (
          <div className="absolute right-2 top-2">{actions}</div>
        ) : null}
        <EmptyState
          description="Start one to get going"
          icon={MessageSquare}
          title="No threads"
        />
      </div>
    );
  }

  return null;
}
