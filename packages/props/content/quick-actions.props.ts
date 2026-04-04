import type { IQuickAction } from '@cloud/interfaces/ui/quick-actions.interface';
import type { ComponentSize } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface QuickActionsContainerProps {
  children: ReactNode;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  className?: string;
}

export interface QuickActionButtonProps {
  action: IQuickAction;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  showLabel?: boolean;
  onClick: (action: IQuickAction) => void;
  className?: string;
}

export interface QuickActionsMenuProps {
  actions: IQuickAction[];
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  onActionClick: (action: IQuickAction) => void;
}
