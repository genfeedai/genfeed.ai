import type {
  IReviewInboxItem,
  ReviewInboxDecision,
  ReviewInboxItemSource,
} from '@genfeedai/contracts/interfaces';

/**
 * Workflow review gates and MCP approvals in the publishing review inbox
 * (#7340), as the review queue hook hands them to the view.
 */
export interface ReviewInboxApprovalsState {
  /** Rows that pass the source filter. */
  items: IReviewInboxItem[];
  error: Error | null;
  isLoading: boolean;
  /** Empty selection shows every source. */
  sourceFilters: readonly ReviewInboxItemSource[];
  /** The row an `approval` deep link points at, when one does. */
  highlightedItemId: string | null;
  /** Set when a deep link points at a row that is no longer pending. */
  isHighlightedItemMissing: boolean;
  decidingItemId: string | null;
  onSourceFilterChange: (sources: ReviewInboxItemSource[]) => void;
  onDecide: (
    item: IReviewInboxItem,
    decision: ReviewInboxDecision,
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface ReviewInboxApprovalsTableProps {
  items: IReviewInboxItem[];
  highlightedItemId: string | null;
  decidingItemId: string | null;
  onDecide: (
    item: IReviewInboxItem,
    decision: ReviewInboxDecision,
  ) => Promise<void>;
}

export interface ReviewInboxApprovalsSectionProps {
  approvals: ReviewInboxApprovalsState;
}

export interface ReviewSourceFiltersProps {
  activeSources: readonly ReviewInboxItemSource[];
  onSourceChange: (sources: ReviewInboxItemSource[]) => void;
}
