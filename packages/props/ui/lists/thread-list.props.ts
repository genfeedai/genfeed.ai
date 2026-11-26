import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import type { ReactNode } from 'react';

/** What the small icon before a thread's title says about it. */
export type ThreadListStatus =
  | 'attention'
  | 'done'
  | 'failed'
  | 'idle'
  | 'resolved'
  | 'running';

/** Recency buckets a flat thread list groups its rows into. */
export type ThreadRecencyGroup = 'earlier' | 'last7Days' | 'today';

export interface ThreadListSectionProps {
  children: ReactNode;
  /** Starts folded, for sections the operator rarely needs (done, resolved). */
  isDefaultCollapsed?: boolean;
  itemCount: number;
  /** Adds a select-all to the header while a selection is under way. */
  selection?: {
    isAllSelected: boolean;
    isSomeSelected: boolean;
    /** Spoken name of the checkbox, e.g. "Select all in Working". */
    label: string;
    onToggle: () => void;
  };
  title: string;
  'data-testid'?: string;
}

export interface ThreadListRowProps {
  /** Accessible name of the row's ⋯ menu trigger. */
  actionsLabel?: string;
  /** Everything the ⋯ menu offers; the menu is left out when empty. */
  actions?: CollectionOverflowAction[];
  href: string;
  /** Shown after the status icon, for a thumbnail or an avatar. */
  leading?: ReactNode;
  /**
   * Opens the thread in place (a side pane) instead of following `href`. A
   * modified click (new tab, new window) still follows the link.
   */
  onSelect?: () => void;
  /** Makes the row selectable: a checkbox takes the status icon's place. */
  selection?: {
    isSelected: boolean;
    /** Some row is selected, so every row shows its checkbox, not its status. */
    isSelecting: boolean;
    /** Spoken name of the checkbox, e.g. "Select {title}". */
    label: string;
    /** `isRange` is set by a Shift-click, which selects from the last pick. */
    onToggle: (options: { isRange: boolean }) => void;
  };
  status?: ThreadListStatus;
  /** Spoken name of the status icon, so the state is not colour alone. */
  statusLabel?: string | null;
  subtitle?: ReactNode;
  /** The right-hand date. Swapped for the ⋯ menu on hover or focus. */
  time?: ReactNode;
  title: string;
  'data-testid'?: string;
}

export interface ThreadListRecencySectionsProps<TItem> {
  getDate: (item: TItem) => string | Date | null | undefined;
  getKey: (item: TItem) => string;
  items: readonly TItem[];
  /** `now` is the list's clock; pass it to `formatThreadTime`. */
  renderRow: (item: TItem, now: Date) => ReactNode;
}
