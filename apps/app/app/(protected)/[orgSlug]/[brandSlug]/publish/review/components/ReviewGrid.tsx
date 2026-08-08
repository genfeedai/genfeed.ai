'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem, IBatchSummary } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Check, Sparkles, X } from 'lucide-react';

import ReviewDetailPanel from './ReviewDetailPanel';
import ReviewItemsTable from './ReviewItemsTable';
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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="rounded-card bg-card shadow-border">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
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

        <div className="border-b border-border px-2 sm:px-3">
          <nav
            aria-label="Review status filters"
            className="-mx-1 flex gap-0.5 overflow-x-auto px-1"
          >
            {REVIEW_FILTERS.map((entry) => {
              const count = filterCounts[entry.filter];
              const isActive = activeFilter === entry.filter;
              return (
                <Button
                  key={entry.filter}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'h-10 shrink-0 gap-1.5 rounded-none border-0 border-b-2 px-3 text-xs font-medium shadow-none',
                    isActive
                      ? 'border-b-foreground bg-transparent text-foreground'
                      : 'border-b-transparent bg-transparent text-foreground/65 hover:bg-transparent hover:text-foreground',
                  )}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <span>{entry.label}</span>
                      <span
                        className={cn(
                          'tabular-nums',
                          isActive
                            ? 'text-foreground/80'
                            : 'text-foreground/45',
                        )}
                      >
                        {count}
                      </span>
                    </span>
                  }
                  onClick={() => {
                    onFilterChange(entry.filter);
                  }}
                  size={ButtonSize.SM}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                />
              );
            })}
          </nav>
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedIds.size}
              </span>{' '}
              selected
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                className="h-7 gap-1 px-2 text-xs"
                isDisabled={isActioning}
                onClick={onBulkApprove}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <Check className="size-3.5" />
                Approve
              </Button>
              <Button
                className="h-7 gap-1 px-2 text-xs"
                isDisabled={isActioning}
                onClick={onBulkReject}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <X className="size-3.5" />
                Reject
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <section className="min-w-0">
          {items.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-card bg-card p-8 text-center shadow-border">
              <div className="rounded-card border border-border bg-background p-3">
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
            <ReviewItemsTable
              activeItemId={activeItem?.id ?? null}
              items={items}
              selectedIds={selectedIds}
              onSelectItem={onSelectItem}
              onToggleSelect={onToggleSelect}
            />
          )}
        </section>

        <ReviewDetailPanel
          isActioning={isActioning}
          isSelected={activeItem ? selectedIds.has(activeItem.id) : false}
          item={activeItem}
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
          onToggleSelect={onToggleSelect}
        />
      </div>
    </div>
  );
}
