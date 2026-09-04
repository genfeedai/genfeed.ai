import type { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { Key, ReactNode } from 'react';

export interface TableColumn<T> {
  key: keyof T | string;
  header: ReactNode;
  render?: (item: T) => ReactNode;
  className?: string;
  actions?: TableAction<T>[];
  sortable?: boolean;
  sortLabel?: string;
}

export type TableSortDirection = 'asc' | 'desc';

/**
 * Destination for a row that navigates.
 *
 * `label` is the anchor's accessible name: the link is a transparent overlay
 * with no text of its own, so without it a screen reader announces an empty
 * link for every row.
 */
export interface TableRowLink {
  href: string;
  label: string;
}

export interface TableProps<T> {
  items: T[];
  isLoading?: boolean;
  columns: TableColumn<T>[];
  actions?: TableAction<T>[];
  /** Render the shared table frame. Disable when a parent surface owns it. */
  framed?: boolean;

  getRowKey?: (item: T, index: number) => Key;
  getRowClassName?: (item: T) => string;
  /** Section title inside the table card chrome (matches Card `label`). */
  label?: string;
  /** Optional supporting line under `label`. */
  description?: string;
  emptyLabel?: string;
  /** Optional supporting line under `emptyLabel`. Omit for title-only empties. */
  emptyDescription?: string;
  emptyState?: ReactNode;

  // Selection support
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  getItemId?: (item: T) => string;

  /**
   * Destination for rows that navigate. Rows that return a link render a real
   * anchor, so the router prefetches the destination before the click, and
   * middle-click and cmd-click open it in a new tab. Return `undefined` for a
   * row with nowhere to go.
   *
   * Prefer this over `onRowClick` for navigation. `onRowClick` stays for rows
   * that open a modal, select an item, or otherwise act in place.
   */
  getRowLink?: (item: T) => TableRowLink | undefined;

  // Row click handler
  onRowClick?: (item: T) => void;

  // Visually hide column headers (sr-only for accessibility)
  hideHeader?: boolean;

  // Controlled sorting support
  sortKey?: string;
  sortDirection?: TableSortDirection;
  onSortChange?: (key: string, direction: TableSortDirection) => void;
}

export interface TableAction<T> {
  icon: ReactNode | ((item: T) => ReactNode);
  tooltip: string | ((item: T) => string);
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;

  getClassName?: (item: T) => string;
  onClick?: (item: T) => void;
  isDisabled?: (item: T) => boolean;
  isVisible?: (item: T) => boolean;
  tooltipPosition?: 'left' | 'right' | 'top' | 'bottom';
}

export interface StandardTableActionsOptions<T> {
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  canEdit?: (item: T) => boolean;
  canDelete?: (item: T) => boolean;
  editClassName?: string;
  deleteClassName?: string;
  additionalActions?: TableAction<T>[];
}
