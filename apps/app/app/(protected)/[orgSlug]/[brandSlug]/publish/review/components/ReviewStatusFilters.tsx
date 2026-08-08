'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

import type { ReviewFilter, ReviewFilterCounts } from './review-grid.helpers';

export const REVIEW_STATUS_FILTERS: Array<{
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

interface ReviewStatusFiltersProps {
  activeFilter: ReviewFilter;
  filterCounts: ReviewFilterCounts;
  onFilterChange: (filter: ReviewFilter) => void;
}

/**
 * Compact status filters for the Publish action rail (same row as batch
 * picker / New release / refresh). Uses shell-height controls, not a second
 * page header.
 */
export default function ReviewStatusFilters({
  activeFilter,
  filterCounts,
  onFilterChange,
}: ReviewStatusFiltersProps) {
  return (
    <nav
      aria-label="Review status filters"
      className="flex max-w-[min(100vw-12rem,28rem)] items-center gap-0.5 overflow-x-auto"
    >
      {REVIEW_STATUS_FILTERS.map((entry) => {
        const count = filterCounts[entry.filter];
        const isActive = activeFilter === entry.filter;

        return (
          <Button
            key={entry.filter}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'h-8 shrink-0 gap-1 rounded-md px-2.5 text-xs font-medium',
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'bg-transparent text-white/65 hover:bg-white/[0.04] hover:text-white/90',
            )}
            label={
              <span className="inline-flex items-center gap-1">
                <span>{entry.label}</span>
                <span
                  className={cn(
                    'tabular-nums',
                    isActive ? 'text-white/75' : 'text-white/40',
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
  );
}
