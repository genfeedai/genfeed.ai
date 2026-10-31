import type { ReviewInboxItemSource } from '@genfeedai/contracts/interfaces';
import type {
  ReviewFilterCounts,
  ReviewStatusFilter,
} from '@/props/publishing/review-filters.props';

export interface ReviewFilterMenuBatchOption {
  label: string;
  value: string;
}

export interface ReviewFilterMenuProps {
  activeFilters: readonly ReviewStatusFilter[];
  activeSources: readonly ReviewInboxItemSource[];
  activeTurboRunId: string | null;
  /** Status and batch only apply while the batch queue is on screen. */
  hasTurboControls: boolean;
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
  filterCounts: ReviewFilterCounts;
  turboRunOptions: readonly ReviewFilterMenuBatchOption[];
  onFilterChange: (filters: ReviewStatusFilter[]) => void;
  onSourceChange: (sources: ReviewInboxItemSource[]) => void;
  onTurboRunChange: (turboRunId: string) => void;
}
