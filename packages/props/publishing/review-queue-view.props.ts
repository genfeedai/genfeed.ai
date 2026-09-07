import type {
  IBatchItem,
  IBatchSummary,
} from '@genfeedai/contracts/interfaces';
import type {
  ReviewFilterCounts,
  ReviewStatusFilter,
} from '@props/publishing/review-filters.props';

export interface ReviewQueueViewProps {
  activeFilters: readonly ReviewStatusFilter[];
  activeItem: IBatchItem | null;
  activeBatch: IBatchSummary | null;
  activeBatchError: Error | null;
  activeBatchId: string | null;
  batchList: IBatchSummary[];
  batchesError: Error | null;
  canDiscardBatch: boolean;
  filterCounts: ReviewFilterCounts;
  hasInvalidBatchPayload: boolean;
  isActioning: boolean;
  isBatchLoading: boolean;
  isRefreshing?: boolean;
  selectedIds: Set<string>;
  selectedPostId: string | null;
  visibleItems: IBatchItem[];
  onApprove: (itemId: string) => Promise<void>;
  onAssign: (itemId: string, assigneeId: string) => Promise<void>;
  onBatchChange: (value: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkRewriteWithAgent: () => void;
  onDiscardBatch: () => void;
  onClosePostDetail: () => void;
  onFilterChange: (filters: ReviewStatusFilter[]) => void;
  onRefresh: () => void | Promise<void>;
  onRequestChanges: (itemId: string, feedback?: string) => Promise<void>;
  onReject: (itemId: string, feedback?: string) => Promise<void>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => Promise<void>;
}
