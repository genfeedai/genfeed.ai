'use client';

import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { useMemo } from 'react';

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

/** Same shell chrome as the batch picker / publish list sort control. */
export const PUBLISH_HEADER_DROPDOWN_CLASS =
  'h-8 max-w-[16rem] rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white/80 hover:bg-white/[0.06] hover:text-white';

interface ReviewStatusFiltersProps {
  activeFilter: ReviewFilter;
  filterCounts: ReviewFilterCounts;
  onFilterChange: (filter: ReviewFilter) => void;
}

/**
 * Status filter as a header dropdown (not a chip rail) so it matches batch
 * picker + New release on the Publish action rail.
 */
export default function ReviewStatusFilters({
  activeFilter,
  filterCounts,
  onFilterChange,
}: ReviewStatusFiltersProps) {
  const options = useMemo(
    () =>
      REVIEW_STATUS_FILTERS.map((entry) => ({
        label: `${entry.label} · ${filterCounts[entry.filter]}`,
        value: entry.filter,
      })),
    [filterCounts],
  );

  return (
    <ButtonDropdown
      className={PUBLISH_HEADER_DROPDOWN_CLASS}
      name="review-status"
      onChange={(_name, value) => {
        onFilterChange(value as ReviewFilter);
      }}
      options={options}
      placeholder="Status"
      tooltip="Filter by review status"
      value={activeFilter}
    />
  );
}
