import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type {
  IReviewInboxItem,
  ReviewInboxItemSource,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { BadgeProps } from '@props/ui/display/badge.props';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import BrandAvatar from '@/features/analytics/components/display/brand-avatar/BrandAvatar';
import type { ReviewInboxApprovalsTableProps } from '@/props/publishing/review-inbox-approvals.props';
import ReviewInboxPreview from './ReviewInboxPreview';
import { REVIEW_INBOX_SOURCE_MESSAGE_KEYS } from './review-inbox.helpers';

const SOURCE_BADGE_VARIANTS: Record<
  ReviewInboxItemSource,
  NonNullable<BadgeProps['variant']>
> = {
  agent: 'purple',
  mcp_client: 'amber',
  workflow: 'blue',
};

/**
 * One row per workflow review gate or MCP approval waiting on a human. Each row
 * says in full what will happen, for which brand, at what cost, who asked and
 * when, with Approve and Reject beside it in words.
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
                logoUrl={item.brandLogoUrl ?? undefined}
                name={item.brandLabel}
                size="sm"
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
            <Badge size={ComponentSize.SM} variant="outline">
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
            <Badge
              size={ComponentSize.SM}
              variant={SOURCE_BADGE_VARIANTS[item.source]}
            >
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
      {
        className: 'w-56',
        header: translate('columns.decision'),
        key: 'decision',
        render: (item) =>
          item.isResolvable ? (
            <span className="flex items-center gap-1.5">
              <Button
                className="h-8 gap-1 px-3 text-xs"
                isDisabled={isDeciding}
                onClick={() => {
                  void onDecide(item, 'approve');
                }}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Check className="size-3.5" />
                {translate('approve')}
              </Button>
              <Button
                className="h-8 gap-1 px-3 text-xs"
                isDisabled={isDeciding}
                onClick={() => {
                  void onDecide(item, 'reject');
                }}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <X className="size-3.5" />
                {translate('reject')}
              </Button>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {translate('notResolvable')}
            </span>
          ),
      },
    ],
    [isDeciding, onDecide, translate],
  );

  return (
    <AppTable<IReviewInboxItem>
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
