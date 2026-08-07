'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem, IBatchSummary } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { Check, Sparkles, X } from 'lucide-react';

import ReviewDetailPanel from './ReviewDetailPanel';
import ReviewItemCard from './ReviewItemCard';
import type { ReviewFilter, ReviewFilterCounts } from './review-grid.helpers';

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
  label: string;
}> = [
  { filter: 'ready', label: 'Ready' },
  { filter: 'approved', label: 'Approved' },
  { filter: 'changes_requested', label: 'Changes' },
  { filter: 'failed', label: 'Failed' },
  { filter: 'pending', label: 'Pending' },
  { filter: 'skipped', label: 'Skipped' },
  { filter: 'all', label: 'All' },
];

function formatBatchStatus(status: unknown): string {
  if (typeof status !== 'string' || !status.trim()) {
    return '';
  }
  return status.replaceAll('_', ' ').toLowerCase();
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
  const statusLabel = formatBatchStatus(batch.status);
  const total = batch.totalCount ?? 0;
  const completed = batch.completedCount ?? 0;
  const failed = batch.failedCount ?? 0;
  const pending =
    typeof batch.pendingCount === 'number'
      ? batch.pendingCount
      : Math.max(total - completed - failed, 0);

  const summaryParts = [
    `${total} total`,
    `${completed} done`,
    failed > 0 ? `${failed} failed` : null,
    pending > 0 ? `${pending} pending` : null,
    statusLabel || null,
  ].filter(Boolean);

  const filterTabs = REVIEW_FILTERS.map((entry) => ({
    id: entry.filter,
    label: entry.label,
    badge: (
      <span className="text-[11px] tabular-nums opacity-70">
        {filterCounts[entry.filter]}
      </span>
    ),
  }));

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,22rem)_minmax(0,1fr)]">
      <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card">
        <div className="space-y-3 border-b border-border px-3 py-3">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                Batch {batch.id.slice(-6)}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {summaryParts.join(' · ')}
              </p>
            </div>
            <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {items.length} shown
            </span>
          </div>

          <Tabs
            activeTab={activeFilter}
            className="w-full"
            fullWidth={false}
            items={filterTabs}
            onTabChange={(id) => {
              onFilterChange(id as ReviewFilter);
            }}
            size="sm"
            variant="underline"
          />

          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedIds.size}
                </span>{' '}
                selected
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  isDisabled={isActioning}
                  onClick={onBulkApprove}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Check className="size-3.5" />
                  Approve
                </Button>
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  isDisabled={isActioning}
                  onClick={onBulkReject}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <X className="size-3.5" />
                  Reject
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full border border-border bg-background p-3">
              <Sparkles className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              No items in this view
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Switch filters or pick another batch.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              'max-h-[min(720px,calc(100dvh-14rem))] space-y-2 overflow-y-auto p-2',
            )}
          >
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
