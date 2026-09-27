import type { IBatchItem } from '@genfeedai/contracts/interfaces';

export interface ReviewGridProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  items: IBatchItem[];
  selectedIds: Set<string>;
  rewritingIds?: ReadonlySet<string>;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkRewrite: () => void;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}
