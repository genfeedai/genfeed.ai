import type { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Key, ReactNode } from 'react';

export interface TableColumn<T> {
  key: keyof T | string;
  header: ReactNode;
  render?: (item: T) => ReactNode;
  className?: string;
  actions?: TableAction<T>[];
}

export interface TableProps<T> {
  items: T[];
  isLoading?: boolean;
  columns: TableColumn<T>[];
  actions?: TableAction<T>[];

  getRowKey?: (item: T, index: number) => Key;
  getRowClassName?: (item: T) => string;
  emptyLabel?: string;
  emptyState?: ReactNode;

  // Selection support
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  getItemId?: (item: T) => string;

  // Row click handler
  onRowClick?: (item: T) => void;

  // Visually hide column headers (sr-only for accessibility)
  hideHeader?: boolean;
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
