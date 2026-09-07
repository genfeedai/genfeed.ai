import type { IBatchItem } from '@genfeedai/contracts/interfaces';

export interface ReviewGridProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  items: IBatchItem[];
  selectedIds: Set<string>;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkRewriteWithAgent: () => void;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}
