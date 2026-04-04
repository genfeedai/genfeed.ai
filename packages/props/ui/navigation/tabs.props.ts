import type { NavigationTab } from '@genfeedai/interfaces/ui/navigation.interface';
import type { ComponentType, ReactNode } from 'react';

export type TabsVariant = 'default' | 'pills' | 'underline' | 'segmented';
export type TabsSize = 'md' | 'sm';
export type TabsMatchMode = 'exact' | 'prefix';

export interface TabItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
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
  items?: TabsItem[];
  tabs?: TabsItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
  variant?: TabsVariant;
  size?: TabsSize;
  fullWidth?: boolean;
}

export type TabsEnhancedProps = TabsProps;
