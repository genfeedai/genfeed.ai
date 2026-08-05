import type { ComponentType, ReactNode } from 'react';

export interface SwitcherDropdownItem {
  id: string;
  label: string;
  isActive: boolean;
  imageUrl?: string;
  trailingAction?: {
    ariaLabel: string;
    href?: string;
    icon: ComponentType<{ className?: string }>;
    onAction: () => void;
    target?: '_blank' | '_self';
  };
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
  isLoading?: boolean;
  emptyMessage?: string;
  minWidth?: number;
  className?: string;
  hasSearch?: boolean;
  searchPlaceholder?: string;
}
