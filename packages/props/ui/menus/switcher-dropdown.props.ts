import type { ComponentType, ReactNode } from 'react';

export interface SwitcherDropdownItem {
  id: string;
  label: string;
  isActive: boolean;
  imageUrl?: string;
}

export interface SwitcherDropdownFooterAction {
  label: string;
  onAction: () => void;
  icon?: ComponentType<{ className?: string }>;
}

export interface SwitcherDropdownProps {
  items: SwitcherDropdownItem[];
  renderTrigger: (state: { isOpen: boolean; isDisabled: boolean }) => ReactNode;
  onSelect: (id: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
  isDisabled?: boolean;
  footerAction?: SwitcherDropdownFooterAction;
  footerActions?: SwitcherDropdownFooterAction[];
  minWidth?: number;
  className?: string;
  hasSearch?: boolean;
  searchPlaceholder?: string;
}
