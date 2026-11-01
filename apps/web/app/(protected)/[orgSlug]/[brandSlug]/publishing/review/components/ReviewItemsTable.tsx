import { ComponentSize, TurboRunItemStatus } from '@genfeedai/contracts';
import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import { Badge } from '@ui/primitives/badge';
import { Checkbox } from '@ui/primitives/checkbox';
import { ArrowUpRight, ExternalLink, PanelRightOpen } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ReviewItemsTableProps } from '@/features/posts/props/review-items-table.props';
import ReviewPostHoverPreview from './ReviewPostHoverPreview';
import {
  formatReviewItemStatus,
  getReviewItemBadgeStatus,
  getReviewItemTitle,
  isReviewItemSelectable,
} from './review-item.helpers';
import {
  getReviewPerformanceLabel,
  getReviewPerformanceSignal,
} from './review-performance';

export default function ReviewItemsTable({
  activeItemId,
  items,
  selectedIds,
  rewritingIds,
  onSelectItem,
  onToggleSelect,
}: ReviewItemsTableProps) {
  const translate = useTranslations('common.turboRewrite');
  const translateReview = useTranslations('pages.publishing.review');
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const router = useRouter();
  const { href } = useOrgUrl();

  const rowActions = useMemo<TableAction<ITurboRunItem>[]>(
    () => [
      {
        icon: <PanelRightOpen className="size-3.5" />,
        onClick: (item) => {
          onSelectItem(item.id);
          // Force-open even when this row is already active and the rail was
          // collapsed (selection-change effect alone is a no-op for same id).
          window.dispatchEvent(
            new CustomEvent('workspace:force-open-review-context'),
          );
        },
        tooltip: translateReview('table.openContext'),
      },
      {
        icon: <ArrowUpRight className="size-3.5" />,
        isVisible: (item) => Boolean(item.postId),
        onClick: (item) => {
          if (!item.postId) {
            return;
          }
          router.push(href(getPublishingPostHref(item.postId)));
        },
        tooltip: translateReview('table.openPost'),
      },
      {
        icon: <ExternalLink className="size-3.5" />,
        isVisible: (item) => Boolean(item.postUrl),
        onClick: (item) => {
          if (!item.postUrl) {
            return;
          }
          window.open(item.postUrl, '_blank', 'noopener,noreferrer');
        },
        tooltip: translateReview('table.openPublished'),
      },
    ],
    [href, onSelectItem, router, translateReview],
  );

  const columns = useMemo<TableColumn<ITurboRunItem>[]>(
    () => [
      {
        className: 'w-10',
        header: '',
        key: 'select',
        render: (item) => {
          if (!isReviewItemSelectable(item)) {
            return <span className="inline-block size-4" />;
          }

          const isSelected = selectedIds.has(item.id);
          return (
            <Checkbox
              aria-label={
                isSelected
                  ? translateReview('table.deselect')
                  : translateReview('table.select')
              }
              className="size-4 border border-border bg-background shadow-sm data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              isChecked={isSelected}
              isDisabled={Boolean(rewritingIds?.has(item.id))}
              name={`review-select-${item.id}`}
              onCheckedChange={() => {
                onToggleSelect(item.id);
              }}
            />
          );
        },
      },
      {
        className: 'w-14',
        header: translateReview('table.media'),
        key: 'media',
        render: (item) =>
          item.mediaUrl ? (
            <ReviewPostHoverPreview
              item={item}
              onOpenDetail={() => {
                onSelectItem(item.id);
              }}
            >
              <span className="relative block size-10 overflow-hidden rounded-md bg-card shadow-border">
                <Image
                  alt=""
                  className="object-cover outline-media"
                  fill
                  sizes="40px"
                  src={item.mediaUrl}
                />
              </span>
            </ReviewPostHoverPreview>
          ) : (
            <span className="inline-flex size-10 items-center justify-center rounded-md border border-dashed border-border text-2xs text-muted-foreground">
              —
            </span>
          ),
      },
      {
        header: translateReview('table.post'),
        key: 'caption',
        render: (item) => {
          const title = getReviewItemTitle(item, translateReview);
          const isRewriting = Boolean(rewritingIds?.has(item.id));
          const titleContent = isRewriting ? (
            <span role="status">{translate('progress')}</span>
          ) : item.postId ? (
            <Link
              className="hover:underline"
              href={href(getPublishingPostHref(item.postId))}
            >
              {title}
            </Link>
          ) : (
            title
          );
          // The title link sits beside the preview trigger, not inside it:
          // the trigger is a button and a link may not nest in one.
          return (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="line-clamp-1 text-sm font-medium text-foreground">
                {titleContent}
              </span>
              <ReviewPostHoverPreview
                item={item}
                onOpenDetail={() => {
                  onSelectItem(item.id);
                }}
              >
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {[
                    item.format ? String(item.format) : null,
                    item.postId ? translateReview('detail.draftLinked') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || translateReview('detail.postDraft')}
                </span>
              </ReviewPostHoverPreview>
            </span>
          );
        },
      },
      {
        className: 'w-28',
        header: translateReview('table.platform'),
        key: 'platform',
        render: (item) =>
          item.platform ? (
            <PlatformBadge platform={item.platform} size={ComponentSize.SM} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        className: 'w-36',
        header: translateReview('table.status'),
        key: 'status',
        render: (item) => {
          const performanceSignal = getReviewPerformanceSignal(item);
          const performanceLabel = getReviewPerformanceLabel(
            performanceSignal,
            translateReview,
          );
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge status={getReviewItemBadgeStatus(item)}>
                {formatReviewItemStatus(item, translateReview)}
              </Badge>
              {performanceLabel ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-medium',
                    performanceSignal === 'winning'
                      ? 'border-success/20 bg-success/10 text-success'
                      : performanceSignal === 'underperforming'
                        ? 'border-destructive/20 bg-destructive/10 text-destructive'
                        : 'border-warning/20 bg-warning/10 text-warning',
                  )}
                >
                  {performanceLabel}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        className: 'w-32',
        header: translateReview('table.schedule'),
        key: 'scheduledDate',
        render: (item) => (
          <TableDateCell
            timeZone={browserTimezone}
            value={item.scheduledDate}
          />
        ),
      },
    ],
    [
      browserTimezone,
      href,
      onSelectItem,
      onToggleSelect,
      selectedIds,
      rewritingIds,
      translate,
      translateReview,
    ],
  );

  return (
    <AppTable<ITurboRunItem>
      actions={rowActions}
      columns={columns}
      emptyLabel={translateReview('table.emptyTitle')}
      getItemId={(item) => item.id}
      getRowClassName={(item) =>
        cn(
          activeItemId === item.id && 'bg-primary/5',
          item.status === TurboRunItemStatus.FAILED && 'bg-destructive/5',
        )
      }
      getRowKey={(item) => item.id}
      items={items}
      onRowClick={(item) => {
        onSelectItem(item.id);
      }}
    />
  );
}
