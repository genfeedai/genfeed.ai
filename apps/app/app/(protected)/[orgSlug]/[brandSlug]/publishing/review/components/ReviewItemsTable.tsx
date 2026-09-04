'use client';

import { BatchItemStatus, ComponentSize } from '@genfeedai/contracts';
import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import { Checkbox } from '@ui/primitives/checkbox';
import { ArrowUpRight, ExternalLink, PanelRightOpen } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
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

interface ReviewItemsTableProps {
  activeItemId: string | null;
  items: IBatchItem[];
  selectedIds: Set<string>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}

export default function ReviewItemsTable({
  activeItemId,
  items,
  selectedIds,
  onSelectItem,
  onToggleSelect,
}: ReviewItemsTableProps) {
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const router = useRouter();
  const { href } = useOrgUrl();

  const rowActions = useMemo<TableAction<IBatchItem>[]>(
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
        tooltip: 'Open in Context',
        tooltipPosition: 'left',
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
        tooltip: 'Open post detail',
        tooltipPosition: 'left',
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
        tooltip: 'Open published URL',
        tooltipPosition: 'left',
      },
    ],
    [href, onSelectItem, router],
  );

  const columns = useMemo<TableColumn<IBatchItem>[]>(
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
              aria-label={isSelected ? 'Deselect item' : 'Select item'}
              className="size-4 border border-border bg-background shadow-sm data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              isChecked={isSelected}
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
        header: 'Media',
        key: 'media',
        render: (item) =>
          item.mediaUrl ? (
            <ReviewPostHoverPreview
              item={item}
              onOpenDetail={() => {
                onSelectItem(item.id);
              }}
            >
              <span className="relative block size-10 overflow-hidden rounded-md bg-background-secondary shadow-border">
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
        header: 'Post',
        key: 'caption',
        render: (item) => {
          const title = getReviewItemTitle(item);
          return (
            <ReviewPostHoverPreview
              item={item}
              onOpenDetail={() => {
                onSelectItem(item.id);
              }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="line-clamp-1 text-sm font-medium text-foreground">
                  {title}
                </span>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {[
                    item.format ? String(item.format) : null,
                    item.postId ? 'Draft linked' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Post draft'}
                </span>
              </span>
            </ReviewPostHoverPreview>
          );
        },
      },
      {
        className: 'w-28',
        header: 'Platform',
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
        header: 'Status',
        key: 'status',
        render: (item) => {
          const performanceSignal = getReviewPerformanceSignal(item);
          const performanceLabel = getReviewPerformanceLabel(performanceSignal);
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge
                size={ComponentSize.SM}
                status={getReviewItemBadgeStatus(item)}
              >
                {formatReviewItemStatus(item)}
              </Badge>
              {performanceLabel ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-medium',
                    performanceSignal === 'winning'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : performanceSignal === 'underperforming'
                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-200',
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
        header: 'Schedule',
        key: 'scheduledDate',
        render: (item) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {item.scheduledDate
              ? formatDateInTimezone(
                  item.scheduledDate,
                  browserTimezone,
                  'short',
                )
              : '—'}
          </span>
        ),
      },
    ],
    [browserTimezone, onSelectItem, onToggleSelect, selectedIds],
  );

  return (
    <AppTable<IBatchItem>
      actions={rowActions}
      columns={columns}
      emptyDescription="Try All statuses, or pick another batch."
      emptyLabel="No items match these filters"
      getItemId={(item) => item.id}
      getRowClassName={(item) =>
        cn(
          activeItemId === item.id && 'bg-primary/[0.06]',
          item.status === BatchItemStatus.FAILED && 'bg-destructive/[0.03]',
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
