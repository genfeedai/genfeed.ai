import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';
import type { ReviewRewriteProgressProps } from '@props/publishing/review-rewrite-progress.props';

export interface ReviewGridProps {
  activeItem: ITurboRunItem | null;
  isActioning: boolean;
  items: ITurboRunItem[];
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
