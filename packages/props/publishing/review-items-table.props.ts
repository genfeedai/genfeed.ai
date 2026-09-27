import type { IBatchItem } from '@genfeedai/contracts/interfaces';

export interface ReviewItemsTableProps {
  activeItemId: string | null;
  items: IBatchItem[];
  selectedIds: Set<string>;
  rewritingIds?: ReadonlySet<string>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}
