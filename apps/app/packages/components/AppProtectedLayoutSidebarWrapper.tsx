'use client';

import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import type { ReactNode } from 'react';
import { memo } from 'react';

import AppProtectedLayoutSidebar, {
  type RouteVariant,
} from './AppProtectedLayoutSidebar';

type ShellChromeVariant = 'default';
type TaskContextSearchParams = URLSearchParams;

type AppProtectedLayoutSidebarWrapperProps = {
  shellChromeVariant: ShellChromeVariant;
  taskContextSearchParams: TaskContextSearchParams;
  routeVariant: RouteVariant;
  isEditorCanvasRoute: boolean;
  currentApp?: MenuSharedProps['currentApp'];
  adminMenuItems: MenuItemConfig[];
  analyticsMenuItems: MenuItemConfig[];
  composeMenuItems: MenuItemConfig[];
  menuItems: MenuItemConfig[];
  orgMenuItems: MenuItemConfig[];
  secondaryMenuItems: MenuItemConfig[];
  settingsMenuItems: MenuItemConfig[];
  studioMenuItems: MenuItemConfig[];
  workflowsMenuItems: MenuItemConfig[];
  conversationActions: ReactNode;
  renderConversations: () => ReactNode;
  onOpenCommandPalette: () => void;
};

const AppProtectedLayoutSidebarWrapper = memo(
  function AppProtectedLayoutSidebarWrapper({
    shellChromeVariant,
    taskContextSearchParams,
    routeVariant,
    isEditorCanvasRoute,
    currentApp,
    adminMenuItems,
    analyticsMenuItems,
    composeMenuItems,
    menuItems,
    orgMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    workflowsMenuItems,
    conversationActions,
    renderConversations,
    onOpenCommandPalette,
  }: AppProtectedLayoutSidebarWrapperProps) {
    if (isEditorCanvasRoute || routeVariant === 'focusedOnboarding') {
      return null;
    }

    return (
      <AppProtectedLayoutSidebar
        shellChromeVariant={shellChromeVariant}
        taskContextSearchParams={taskContextSearchParams}
        routeVariant={routeVariant}
        currentApp={currentApp}
        adminMenuItems={adminMenuItems}
        analyticsMenuItems={analyticsMenuItems}
        composeMenuItems={composeMenuItems}
        menuItems={menuItems}
        orgMenuItems={orgMenuItems}
        secondaryMenuItems={secondaryMenuItems}
        settingsMenuItems={settingsMenuItems}
        studioMenuItems={studioMenuItems}
        workflowsMenuItems={workflowsMenuItems}
        conversationActions={conversationActions}
        renderConversations={renderConversations}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    );
  },
);

export default AppProtectedLayoutSidebarWrapper;
