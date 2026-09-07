import type { IBatchItem } from '@genfeedai/contracts/interfaces';

export interface ReviewItemsTableProps {
  activeItemId: string | null;
  items: IBatchItem[];
  selectedIds: Set<string>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}
