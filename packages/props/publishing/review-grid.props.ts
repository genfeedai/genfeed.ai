import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import type { ReviewRewriteProgressProps } from '@props/publishing/review-rewrite-progress.props';

export interface ReviewGridProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  items: IBatchItem[];
  selectedIds: Set<string>;
  rewritingIds?: ReadonlySet<string>;
  isRewriteStarting?: boolean;
  rewriteProgress?: ReviewRewriteProgressProps | null;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkRewrite: () => void;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}
