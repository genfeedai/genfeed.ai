import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';

export interface ReviewItemsTableProps {
  activeItemId: string | null;
  items: ITurboRunItem[];
  selectedIds: Set<string>;
  rewritingIds?: ReadonlySet<string>;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}
