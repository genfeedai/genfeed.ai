'use client';

import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { useMemo } from 'react';

import type {
  ReviewFilterCounts,
  ReviewStatusFilter,
} from './review-grid.helpers';
import { REVIEW_STATUS_FILTER_VALUES } from './review-grid.helpers';

const STATUS_LABELS: Record<ReviewStatusFilter, string> = {
  approved: 'Approved',
  changes_requested: 'Changes',
  failed: 'Failed',
  pending: 'Pending',
  ready: 'Ready',
  skipped: 'Skipped',
};

/** Same shell chrome as the batch picker / publish list sort control. */
export const PUBLISH_HEADER_DROPDOWN_CLASS =
  'h-8 max-w-[16rem] rounded-md border border-border bg-card px-3 text-sm text-foreground/80 hover:bg-hover hover:text-foreground';

interface ReviewStatusFiltersProps {
  activeFilters: readonly ReviewStatusFilter[];
  filterCounts: ReviewFilterCounts;
  onFilterChange: (filters: ReviewStatusFilter[]) => void;
}

/**
 * Multi-select status filter for the Publish action rail.
 * Empty selection = all statuses.
 */
export default function ReviewStatusFilters({
  activeFilters,
  filterCounts,
  onFilterChange,
}: ReviewStatusFiltersProps) {
  const options = useMemo(
    () =>
      REVIEW_STATUS_FILTER_VALUES.map((filter) => ({
        // Short base label — MultiSelect truncates the trigger; count stays useful.
        label: `${STATUS_LABELS[filter]} · ${filterCounts[filter]}`,
        value: filter,
      })),
    [filterCounts],
  );

  return (
    <DropdownMultiSelect
      className={PUBLISH_HEADER_DROPDOWN_CLASS}
      name="review-status"
      onChange={(_name, values) => {
        onFilterChange(values as ReviewStatusFilter[]);
      }}
      options={options}
      placeholder="All statuses"
      values={[...activeFilters]}
    />
  );
}
