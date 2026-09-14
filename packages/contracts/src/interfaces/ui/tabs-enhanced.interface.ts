import type { ReactNode } from 'react';
import type { IconComponent } from '../../types/icon';
import type { NavigationTab } from '../index';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconComponent;
  badge?: ReactNode;
  isDisabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[] | string[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export interface TabsEnhancedProps extends Omit<TabsProps, 'tabs'> {
  tabs: (TabItem | string | NavigationTab)[];
  navigation?: boolean;
}
