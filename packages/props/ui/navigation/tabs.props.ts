import type { NavigationTab } from '@genfeedai/contracts/interfaces/ui/navigation.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export type TabsMatchMode = 'exact' | 'prefix';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconComponent;
  badge?: ReactNode;
  isDisabled?: boolean;
}

export interface RouteTabItem extends NavigationTab {
  id?: string;
  matchMode?: TabsMatchMode;
  matchPaths?: string[];
}

export type TabsItem = TabItem | RouteTabItem | string;

export interface TabsProps {
  ariaLabel?: string;
  children?: ReactNode;
  items?: TabsItem[];
  tabs?: TabsItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
  contentClassName?: string;
  fullWidth?: boolean;
  stopClickPropagation?: boolean;
  testId?: string;
}

export type TabsEnhancedProps = TabsProps;

export interface PanelTabItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconComponent;
  readonly content: ReactNode;
  readonly isOpen: boolean;
  readonly keepMounted?: boolean;
  readonly testId?: string;
}
export interface PanelTabsProps {
  readonly activeTab: string | null;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly emptyState?: ReactNode;
  readonly footer?: ReactNode;
  readonly items: readonly PanelTabItem[];
  readonly onTabChange: (id: string) => void;
  readonly testId?: string;
}
