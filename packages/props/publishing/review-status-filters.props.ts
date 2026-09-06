import type {
  ReviewFilterCounts,
  ReviewStatusFilter,
} from '@props/publishing/review-filters.props';

export interface ReviewStatusFiltersProps {
  activeFilters: readonly ReviewStatusFilter[];
  filterCounts: ReviewFilterCounts;
  onFilterChange: (filters: ReviewStatusFilter[]) => void;
}
