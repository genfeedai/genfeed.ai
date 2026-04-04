import type { ComponentType, ReactNode } from 'react';
import type { NavigationTab } from '../index';
export interface TabItem {
    id: string;
    label: string;
    icon?: ComponentType<{
        className?: string;
    }>;
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
//# sourceMappingURL=tabs-enhanced.interface.d.ts.map