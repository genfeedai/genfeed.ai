import { ComponentSize } from '@genfeedai/contracts';
import type {
  IReviewInboxItem,
  ReviewInboxItemSource,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReviewInboxApprovalsTableProps } from '@props/publishing/review-inbox-approvals.props';
import type { BadgeProps } from '@props/ui/display/badge.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { REVIEW_INBOX_SOURCE_MESSAGE_KEYS } from './review-inbox.helpers';

const SOURCE_BADGE_VARIANTS: Record<
  ReviewInboxItemSource,
  NonNullable<BadgeProps['variant']>
> = {
  agent: 'purple',
  mcp_client: 'amber',
  workflow: 'blue',
};

/** One row per workflow review gate or MCP approval waiting on a human. */
export default function ReviewInboxApprovalsTable({
  items,
  highlightedItemId,
  decidingItemId,
  onDecide,
}: ReviewInboxApprovalsTableProps) {
  const translate = useTranslations('pages.publishing.review.inbox');

  const actions = useMemo<TableAction<IReviewInboxItem>[]>(
    () => [
      {
        icon: <Check className="size-3.5" />,
        isDisabled: () => decidingItemId !== null,
        isVisible: (item) => item.isResolvable,
        onClick: (item) => {
          void onDecide(item, 'approve');
        },
        tooltip: translate('approve'),
        tooltipPosition: 'left',
      },
      {
        icon: <X className="size-3.5" />,
        isDisabled: () => decidingItemId !== null,
        isVisible: (item) => item.isResolvable,
        onClick: (item) => {
          void onDecide(item, 'reject');
        },
        tooltip: translate('reject'),
        tooltipPosition: 'left',
      },
    ],
    [decidingItemId, onDecide, translate],
  );

  const columns = useMemo<TableColumn<IReviewInboxItem>[]>(
    () => [
      {
        className: 'w-28',
        header: translate('columns.source'),
        key: 'source',
        render: (item) => (
          <Badge
            size={ComponentSize.SM}
            variant={SOURCE_BADGE_VARIANTS[item.source]}
          >
            {translate(REVIEW_INBOX_SOURCE_MESSAGE_KEYS[item.source])}
          </Badge>
        ),
      },
      {
        className: 'w-36',
        header: translate('columns.brand'),
        key: 'brandLabel',
        render: (item) => (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {item.brandLabel ?? translate('organizationWide')}
          </span>
        ),
      },
      {
        header: translate('columns.request'),
        key: 'actionSummary',
        render: (item) => (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-1 text-sm font-medium text-foreground">
              {item.actionSummary}
            </span>
            {item.preview.caption ? (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {item.preview.caption}
              </span>
            ) : null}
            {item.reasons.map((reason) => (
              <span
                className="line-clamp-1 text-xs text-warning"
                key={reason.code}
              >
                {reason.message}
              </span>
            ))}
          </span>
        ),
      },
      {
        className: 'w-36',
        header: translate('columns.status'),
        key: 'status',
        render: (item) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge size={ComponentSize.SM} status="pending">
              {translate('pending')}
            </Badge>
            {item.estimatedCredits !== null ? (
              <Badge size={ComponentSize.SM} variant="outline">
                {translate('credits', { count: item.estimatedCredits })}
              </Badge>
            ) : null}
          </span>
        ),
      },
    ],
    [translate],
  );

  return (
    <AppTable<IReviewInboxItem>
      actions={actions}
      ariaLabel={translate('title')}
      columns={columns}
      getRowClassName={(item) =>
        cn(
          item.id === highlightedItemId && 'bg-primary/[0.08]',
          item.id === decidingItemId && 'opacity-60',
        )
      }
      getRowKey={(item) => item.id}
      items={items}
    />
  );
}
