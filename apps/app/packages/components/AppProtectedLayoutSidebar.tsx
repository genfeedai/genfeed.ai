'use client';

import { ADMIN_LOGO_HREF } from '@app-config/admin-menu-items.config';
import { ANALYTICS_LOGO_HREF } from '@app-config/analytics-menu-items.config';
import { COMPOSE_LOGO_HREF } from '@app-config/compose-menu-items.config';
import { APP_LOGO_HREF } from '@app-config/menu-items.config';
import { ORG_LOGO_HREF } from '@app-config/org-menu-items.config';
import { SETTINGS_LOGO_HREF } from '@app-config/settings-menu-items.config';
import { STUDIO_LOGO_HREF } from '@app-config/studio-menu-items.config';
import { WORKFLOWS_LOGO_HREF } from '@app-config/workflows-menu-items.config';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import AdminSidebar from '@ui/shell/menus/AdminSidebar';
import AppSidebar from '@ui/shell/menus/AppSidebar';
import type { ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';
import { withTaskContextHref } from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import ChatSidebarContent from './AppProtectedLayoutChatSidebar';

type ShellChromeVariant = 'default';

type TaskContextSearchParams = URLSearchParams;

type Props = {
  shellChromeVariant: ShellChromeVariant;
  taskContextSearchParams: TaskContextSearchParams;
  currentApp?: MenuSharedProps['currentApp'];
  isAdminRoute: boolean;
  isAnalyticsRoute: boolean;
  isComposeRoute: boolean;
  isConversationRoute: boolean;
  isEditorRoute: boolean;
  isFocusedOnboardingRoute: boolean;
  isOrgRoute: boolean;
  isSettingsRoute: boolean;
  isStudioRoute: boolean;
  isWorkflowsRoute: boolean;
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

export default function AppProtectedLayoutSidebar({
  shellChromeVariant,
  taskContextSearchParams,
  currentApp,
  isAdminRoute,
  isAnalyticsRoute,
  isComposeRoute,
  isConversationRoute,
  isEditorRoute,
  isFocusedOnboardingRoute,
  isOrgRoute,
  isSettingsRoute,
  isStudioRoute,
  isWorkflowsRoute,
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
}: Props) {
  const { href: buildHref, orgHref } = useOrgUrl();

  if (isFocusedOnboardingRoute) {
    return null;
  }

  if (isStudioRoute) {
    return (
      <AppSidebar
        backHref={withTaskContextHref(
          buildHref(STUDIO_LOGO_HREF),
          taskContextSearchParams,
        )}
        backLabel="Library"
        items={studioMenuItems}
        logoHref={withTaskContextHref(
          buildHref(STUDIO_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Studio"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  if (isAdminRoute) {
    return (
      <AdminSidebar
        items={adminMenuItems}
        logoHref={withTaskContextHref(ADMIN_LOGO_HREF, taskContextSearchParams)}
      />
    );
  }

  if (isComposeRoute) {
    return (
      <AppSidebar
        items={composeMenuItems}
        logoHref={withTaskContextHref(
          buildHref(COMPOSE_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Compose"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  if (isWorkflowsRoute) {
    return (
      <AppSidebar
        items={workflowsMenuItems}
        logoHref={withTaskContextHref(
          buildHref(WORKFLOWS_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Workflows"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  if (isEditorRoute) {
    return (
      <AppSidebar
        items={[]}
        logoHref={withTaskContextHref(
          buildHref('/workspace/overview'),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Editor"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  if (isAnalyticsRoute) {
    return (
      <AppSidebar
        items={analyticsMenuItems}
        logoHref={withTaskContextHref(
          buildHref(ANALYTICS_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Analytics"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  if (isOrgRoute) {
    return (
      <AppSidebar
        items={orgMenuItems}
        logoHref={withTaskContextHref(
          orgHref(ORG_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Organization"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  if (isSettingsRoute) {
    return (
      <AppSidebar
        items={settingsMenuItems}
        logoHref={withTaskContextHref(
          buildHref(SETTINGS_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Settings"
        shellChromeVariant={shellChromeVariant}
      />
    );
  }

  return (
    <AppSidebar
      currentApp={currentApp}
      items={isConversationRoute ? [] : menuItems}
      logoHref={withTaskContextHref(
        buildHref(APP_LOGO_HREF),
        taskContextSearchParams,
      )}
      sectionLabel={undefined}
      collapsedSidebarWidth={0}
      mobileSidebarWidth={isConversationRoute ? undefined : 304}
      renderTopSlot={
        isConversationRoute
          ? undefined
          : () => (
              <>
                <SidebarActionTrigger
                  ariaLabel="Open new task modal"
                  icon={<HiPlus className="size-4 flex-shrink-0" />}
                  label="New Task"
                  onClick={dispatchOpenTaskComposer}
                  shortcut="⌘⇧N"
                />
                <SidebarSearchTrigger onClick={onOpenCommandPalette} />
              </>
            )
      }
      secondaryItems={isConversationRoute ? undefined : secondaryMenuItems}
      renderBody={
        isConversationRoute
          ? () => (
              <ChatSidebarContent
                conversationActions={conversationActions}
                renderConversations={renderConversations}
              />
            )
          : undefined
      }
      shellMode={isConversationRoute ? 'default' : 'workspace'}
      showPrimaryItems={!isConversationRoute}
      sidebarWidth={isConversationRoute ? undefined : 304}
      shellChromeVariant={shellChromeVariant}
    />
  );
}
