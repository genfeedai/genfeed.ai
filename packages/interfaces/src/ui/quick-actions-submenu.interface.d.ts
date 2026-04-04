import type { ReactNode } from 'react';
import type { IQuickAction } from './quick-actions.interface';
export interface QuickActionsSubmenuProps {
    label: string;
    icon: ReactNode;
    actions: IQuickAction[];
    size?: 'sm' | 'md' | 'lg';
    onActionClick: (action: IQuickAction) => void;
    className?: string;
}
//# sourceMappingURL=quick-actions-submenu.interface.d.ts.map