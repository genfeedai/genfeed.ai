'use client';

import type { IBatchItem, IBatchSummary } from '@cloud/interfaces';
import { BatchItemStatus, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import ReviewDetailPanel from '@pages/review/components/ReviewDetailPanel';
import ReviewItemCard from '@pages/review/components/ReviewItemCard';
import {
  isApproved,
  isChangesRequested,
  isPendingReview,
  isReadyToReview,
  isRejected,
} from '@pages/review/components/review-state';
import Button from '@ui/buttons/base/Button';
import { HiCheck, HiOutlineSparkles, HiXMark } from 'react-icons/hi2';

export type ReviewFilter =
  | 'ready'
  | 'approved'
  | 'changes_requested'
  | 'failed'
  | 'pending'
  | 'skipped'
  | 'all';

interface ReviewFilterCounts {
  all: number;
  approved: number;
  changes_requested: number;
  failed: number;
  pending: number;
  ready: number;
  skipped: number;
}

interface ReviewGridProps {
  activeFilter: ReviewFilter;
  activeItem: IBatchItem | null;
  batch: IBatchSummary;
  filterCounts: ReviewFilterCounts;
  isActioning: boolean;
  items: IBatchItem[];
  selectedIds: Set<string>;
  onApprove: (itemId: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onFilterChange: (filter: ReviewFilter) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}

const REVIEW_FILTERS: Array<{
  filter: ReviewFilter;
  helper: string;
  label: string;
}> = [
  { filter: 'ready', helper: 'Needs action now', label: 'Ready' },
  {
    filter: 'approved',
    helper: 'Approved and moved forward',
    label: 'Approved',
  },
  {
    filter: 'changes_requested',
    helper: 'Sent back for revision',
    label: 'Changes',
  },
  { filter: 'failed', helper: 'Generation failed', label: 'Failed' },
  { filter: 'pending', helper: 'Still generating', label: 'Pending' },
  { filter: 'skipped', helper: 'Rejected items', label: 'Skipped' },
  { filter: 'all', helper: 'Everything in this batch', label: 'All' },
];

export function getReviewFilterCounts(items: IBatchItem[]): ReviewFilterCounts {
  return items.reduce<ReviewFilterCounts>(
    (counts, item) => {
      counts.all += 1;

      if (isApproved(item)) {
        counts.approved += 1;
        return counts;
      }

      if (isChangesRequested(item)) {
        counts.changes_requested += 1;
        return counts;
      }

      if (isReadyToReview(item)) {
        counts.ready += 1;
        return counts;
      }

      if (item.status === BatchItemStatus.FAILED) {
        counts.failed += 1;
        return counts;
      }

      if (isRejected(item)) {
        counts.skipped += 1;
        return counts;
      }

      if (isPendingReview(item)) {
        counts.pending += 1;
      }

      return counts;
    },
    {
      all: 0,
      approved: 0,
      changes_requested: 0,
      failed: 0,
      pending: 0,
      ready: 0,
      skipped: 0,
    },
  );
}

export function getVisibleReviewItems(
  items: IBatchItem[],
  activeFilter: ReviewFilter,
): IBatchItem[] {
  if (activeFilter === 'all') {
    return items;
  }

  return items.filter((item) => {
    switch (activeFilter) {
      case 'approved':
        return isApproved(item);
      case 'changes_requested':
        return isChangesRequested(item);
      case 'failed':
        return item.status === BatchItemStatus.FAILED;
      case 'pending':
        return isPendingReview(item);
      case 'ready':
        return isReadyToReview(item);
      case 'skipped':
        return isRejected(item);
      default:
        return true;
    }
  });
}

export default function ReviewGrid({
  activeFilter,
  activeItem,
  batch,
  filterCounts,
  isActioning,
  items,
  selectedIds,
  onApprove,
  onBulkApprove,
  onBulkReject,
  onFilterChange,
  onRequestChanges,
  onReject,
  onSelectItem,
  onToggleSelect,
}: ReviewGridProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/45">
                Publishing Inbox
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                Batch {batch.id.slice(-6)}
              </h2>
              <p className="mt-1 text-sm text-foreground/55">
                Work through ready-to-publish assets one decision at a time.
              </p>
            </div>
            <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-foreground/55">
              {items.length} visible
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {REVIEW_FILTERS.map((filter) => (
              <button
                key={filter.filter}
                type="button"
                onClick={() => onFilterChange(filter.filter)}
                className={cn(
                  'rounded-full border px-3 py-2 text-left transition-colors',
                  activeFilter === filter.filter
                    ? 'border-primary/40 bg-primary/15 text-foreground'
                    : 'border-white/10 bg-white/[0.02] text-foreground/60 hover:border-white/20 hover:text-foreground/80',
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{filter.label}</span>
                  <span className="text-xs text-foreground/45">
                    {filterCounts[filter.filter as keyof ReviewFilterCounts]}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-foreground/40">
                  {filter.helper}
                </div>
              </button>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedIds.size} selected
                  </p>
                  <p className="text-xs text-foreground/50">
                    Use bulk review for obvious keeps and skips.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    isDisabled={isActioning}
                    onClick={onBulkApprove}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <HiCheck className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    isDisabled={isActioning}
                    onClick={onBulkReject}
                    className="flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    <HiXMark className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex min-h-[440px] flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full border border-white/10 bg-white/[0.03] p-4">
              <HiOutlineSparkles className="h-6 w-6 text-foreground/50" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              No items in this view
            </p>
            <p className="mt-1 max-w-xs text-sm text-foreground/50">
              Switch filters or pick another batch to continue reviewing
              content.
            </p>
          </div>
        ) : (
          <div className="max-h-[720px] space-y-3 overflow-y-auto p-4">
            {items.map((item) => (
              <ReviewItemCard
                key={item.id}
                isActive={activeItem?.id === item.id}
                isSelected={selectedIds.has(item.id)}
                item={item}
                onSelect={() => onSelectItem(item.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        )}
      </section>

      <ReviewDetailPanel
        item={activeItem}
        isActioning={isActioning}
        isSelected={activeItem ? selectedIds.has(activeItem.id) : false}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
        onReject={onReject}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
}
