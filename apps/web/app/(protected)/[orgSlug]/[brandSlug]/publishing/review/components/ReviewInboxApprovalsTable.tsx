import { createPublishingBatchRoute } from '@genfeedai/contracts/constants';
import {
  type IReviewInboxItem,
  parseReviewInboxItemId,
  type ReviewInboxItemSource,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import AppTable from '@ui/display/table/Table';
import type { BadgeProps } from '@ui/primitives/badge';
import { Badge } from '@ui/primitives/badge';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { ArrowRight, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ReviewInboxApprovalsTableProps } from '@/props/publishing/review-inbox-approvals.props';
import ReviewInboxPreview from './ReviewInboxPreview';
import { REVIEW_INBOX_SOURCE_MESSAGE_KEYS } from './review-inbox.helpers';

const SOURCE_BADGE_VARIANTS: Record<
  ReviewInboxItemSource,
  NonNullable<BadgeProps['variant']>
> = {
  agent: 'default',
  mcp_client: 'warning',
  workflow: 'info',
};

/**
 * One row per workflow review gate or MCP approval waiting on a human. Each row
 * says in full what will happen, for which brand, at what cost, who asked and
 * when. Approve and Reject are the row's actions: revealed on hover or keyboard
 * focus, always visible where the pointer cannot hover.
 */
export default function ReviewInboxApprovalsTable({
  items,
  highlightedItemId,
  decidingItemId,
  isBulkDeciding,
  selectedIds,
  onSelectionChange,
  onDecide,
}: ReviewInboxApprovalsTableProps) {
  const translate = useTranslations('pages.publishing.review.inbox');
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const isDeciding = decidingItemId !== null || isBulkDeciding;

  const columns = useMemo<TableColumn<IReviewInboxItem>[]>(
    () => [
      {
        className: 'w-44',
        header: translate('columns.brand'),
        key: 'brandLabel',
        render: (item) =>
          item.brandLabel ? (
            <span className="flex min-w-0 items-center gap-2">
              <BrandAvatar
                alt={item.brandLabel}
                name={item.brandLabel}
                size="sm"
                src={item.brandLogoUrl}
              />
              <span className="min-w-0 break-words text-sm text-foreground">
                {item.brandLabel}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {translate('organizationWide')}
            </span>
          ),
      },
      {
        header: translate('columns.request'),
        key: 'actionTitle',
        render: (item) => (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="break-words text-sm font-medium text-foreground">
              {item.actionTitle}
            </span>
            {item.actionDetails ? (
              <span className="break-words text-xs text-muted-foreground">
                {item.actionDetails}
              </span>
            ) : null}
            {item.isResolvable ? null : (
              <span className="break-words text-xs text-muted-foreground">
                {translate('notResolvable')}
              </span>
            )}
            {item.reasons.map((reason) => (
              <span
                className="break-words text-xs text-warning"
                key={reason.code}
              >
                {reason.message}
              </span>
            ))}
          </span>
        ),
      },
      {
        className: 'w-72',
        header: translate('columns.preview'),
        key: 'preview',
        render: (item) => <ReviewInboxPreview preview={item.preview} />,
      },
      {
        className: 'w-24',
        header: translate('columns.cost'),
        key: 'estimatedCredits',
        render: (item) =>
          item.estimatedCredits !== null ? (
            <Badge variant="outline">
              {translate('credits', { count: item.estimatedCredits })}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {translate('costUnknown')}
            </span>
          ),
      },
      {
        className: 'w-44',
        header: translate('columns.requested'),
        key: 'requestedAt',
        render: (item) => (
          <span className="flex min-w-0 flex-col items-start gap-1">
            <Badge variant={SOURCE_BADGE_VARIANTS[item.source]}>
              {translate(REVIEW_INBOX_SOURCE_MESSAGE_KEYS[item.source])}
            </Badge>
            {item.requestedByLabel ? (
              <span className="break-words text-xs text-foreground">
                {translate('requestedBy', { name: item.requestedByLabel })}
              </span>
            ) : null}
            <ClientFormattedDate
              className="text-xs text-muted-foreground"
              format="relative"
              value={item.requestedAt}
            />
          </span>
        ),
      },
    ],
    [translate],
  );

  const actions = useMemo<TableAction<IReviewInboxItem>[]>(
    () => [
      // A scheduled week is read in full on its own page before it is
      // approved, so the row opens it instead of approving in place.
      {
        icon: <ArrowRight />,
        isVisible: (item) => item.isResolvable && item.batchCount !== null,
        onClick: (item) => {
          const parsed = parseReviewInboxItemId(item.id);
          if (parsed?.kind === 'mcp_approval') {
            push(href(createPublishingBatchRoute(parsed.approvalId)));
          }
        },
        tone: 'success',
        tooltip: (item) =>
          translate('reviewBatch', { count: item.batchCount ?? 0 }),
      },
      {
        icon: <Check />,
        isDisabled: () => isDeciding,
        isVisible: (item) => item.isResolvable && item.batchCount === null,
        onClick: (item) => {
          void onDecide(item, 'approve');
        },
        tone: 'success',
        tooltip: translate('approve'),
      },
      {
        icon: <X />,
        isDisabled: () => isDeciding,
        isVisible: (item) => item.isResolvable,
        onClick: (item) => {
          void onDecide(item, 'reject');
        },
        tone: 'destructive',
        tooltip: translate('reject'),
      },
    ],
    [href, isDeciding, onDecide, push, translate],
  );

  return (
    <AppTable<IReviewInboxItem>
      actions={actions}
      ariaLabel={translate('ariaLabel')}
      columns={columns}
      getRowClassName={(item) =>
        cn(
          item.id === highlightedItemId && 'bg-primary/10',
          item.id === decidingItemId && 'opacity-60',
        )
      }
      getItemId={(item) => item.id}
      getRowKey={(item) => item.id}
      items={items}
      onSelectionChange={onSelectionChange}
      selectable
      selectedIds={selectedIds}
    />
  );
}
