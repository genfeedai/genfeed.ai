import type { ReactNode } from 'react';

export interface ContextMenuItemConfig {
  id: string;
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItemConfig[];
  onClick?: () => void;
}

export function createSeparator(id: string): ContextMenuItemConfig {
  return { id, separator: true };
}
