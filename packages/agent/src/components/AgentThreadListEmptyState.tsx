import { ButtonVariant } from '@genfeedai/contracts';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { EmptyState } from '@ui/primitives/empty-state';
import { MessageSquare, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('agent.threadList');

  if (isLoading) {
    return (
      <div role="status" aria-label={translate('loading')}>
        <ListRowsSkeleton rows={6} />
      </div>
    );
  }

  if (shouldShowLoadFailureState) {
    return (
      <EmptyState
        action={{
          label: translate('retry'),
          onClick: onRetry,
          variant: ButtonVariant.SECONDARY,
        }}
        description={translate('loadFailedDescription')}
        icon={TriangleAlert}
        title={translate('loadFailedTitle')}
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
          description={translate('emptyDescription')}
          icon={MessageSquare}
          title={translate('emptyTitle')}
        />
      </div>
    );
  }

  return null;
}
