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
  /** A bulk decision is running, so no other decision may start. */
  isBulkDeciding: boolean;
  onSourceFilterChange: (sources: ReviewInboxItemSource[]) => void;
  onDecide: (
    item: IReviewInboxItem,
    decision: ReviewInboxDecision,
  ) => Promise<void>;
  /** Decides the items in one batch request; one summary notification, one refetch. */
  onDecideMany: (
    items: readonly IReviewInboxItem[],
    decision: ReviewInboxDecision,
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface ReviewInboxApprovalsTableProps {
  items: IReviewInboxItem[];
  highlightedItemId: string | null;
  decidingItemId: string | null;
  isBulkDeciding: boolean;
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onDecide: (
    item: IReviewInboxItem,
    decision: ReviewInboxDecision,
  ) => Promise<void>;
}

export interface ReviewInboxApprovalsSectionProps {
  approvals: ReviewInboxApprovalsState;
  /** Heads the requests as their own section; omit to render the bare table. */
  title?: string;
}

export interface ReviewInboxBulkBarProps {
  /** Rows selected, across pages. */
  selectedCount: number;
  /** Rows that can be decided at all, the ceiling for "Select all". */
  totalCount: number;
  isDisabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
  onSelectAll: () => void;
}
