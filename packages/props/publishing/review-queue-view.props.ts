import type {
  ITurboRunItem,
  ITurboRunSummary,
} from '@genfeedai/contracts/interfaces';
import type {
  ReviewFilterCounts,
  ReviewStatusFilter,
} from '@props/publishing/review-filters.props';
import type { ReviewInboxApprovalsState } from '@props/publishing/review-inbox-approvals.props';
import type { ReviewRewriteProgressProps } from '@props/publishing/review-rewrite-progress.props';

export interface ReviewQueueViewProps {
  activeFilters: readonly ReviewStatusFilter[];
  activeItem: ITurboRunItem | null;
  activeTurboRun: ITurboRunSummary | null;
  activeTurboRunError: Error | null;
  activeTurboRunId: string | null;
  /** Workflow review gates and MCP approvals beside the Turbo run drafts. */
  approvals: ReviewInboxApprovalsState;
  turboRunList: ITurboRunSummary[];
  turboRunsError: Error | null;
  canDiscardTurboRun: boolean;
  filterCounts: ReviewFilterCounts;
  hasInvalidTurboRunPayload: boolean;
  isActioning: boolean;
  isTurboRunLoading: boolean;
  isRefreshing?: boolean;
  selectedIds: Set<string>;
  rewritingIds?: ReadonlySet<string>;
  isRewriteStarting?: boolean;
  rewriteProgress?: ReviewRewriteProgressProps | null;
  selectedPostId: string | null;
  visibleItems: ITurboRunItem[];
  onApprove: (itemId: string) => Promise<void>;
  onAssign: (itemId: string, assigneeId: string) => Promise<void>;
  onTurboRunChange: (value: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkRewrite: () => void;
  onDiscardTurboRun: () => void;
  onClosePostDetail: () => void;
  onFilterChange: (filters: ReviewStatusFilter[]) => void;
  onRefresh: () => void | Promise<void>;
  onRequestChanges: (itemId: string, feedback?: string) => Promise<void>;
  onReject: (itemId: string, feedback?: string) => Promise<void>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => Promise<void>;
}
