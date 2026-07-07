'use client';

import { ADMIN_LOGO_HREF } from '@app-config/admin-menu-items.config';
import { ANALYTICS_LOGO_HREF } from '@app-config/analytics-menu-items.config';
import { COMPOSE_LOGO_HREF } from '@app-config/compose-menu-items.config';
import { LIBRARY_LOGO_HREF } from '@app-config/library-menu-items.config';
import { APP_LOGO_HREF } from '@app-config/menu-items.config';
import { ORG_LOGO_HREF } from '@app-config/org-menu-items.config';
import { RESEARCH_LOGO_HREF } from '@app-config/research-menu-items.config';
import { SETTINGS_LOGO_HREF } from '@app-config/settings-menu-items.config';
import { STUDIO_LOGO_HREF } from '@app-config/studio-menu-items.config';
import { WORKFLOWS_LOGO_HREF } from '@app-config/workflows-menu-items.config';
import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import AdminSidebar from '@ui/shell/menus/AdminSidebar';
import AppSidebar from '@ui/shell/menus/AppSidebar';
import type { ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';
import { withTaskContextHref } from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import AgentSidebarContent from './AppProtectedLayoutAgentSidebar';

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
  isLibraryRoute: boolean;
  isOrgRoute: boolean;
  isResearchRoute: boolean;
  isSettingsRoute: boolean;
  isStudioRoute: boolean;
  isWorkflowsRoute: boolean;
  isCollapsed?: MenuSharedProps['isCollapsed'];
  onToggleCollapse?: MenuSharedProps['onToggleCollapse'];
  adminMenuItems: MenuItemConfig[];
  analyticsMenuItems: MenuItemConfig[];
  composeMenuItems: MenuItemConfig[];
  libraryMenuItems: MenuItemConfig[];
  menuItems: MenuItemConfig[];
  orgMenuItems: MenuItemConfig[];
  researchMenuItems: MenuItemConfig[];
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
  isLibraryRoute,
  isOrgRoute,
  isResearchRoute,
  isSettingsRoute,
  isStudioRoute,
  isWorkflowsRoute,
  isCollapsed,
  onToggleCollapse,
  adminMenuItems,
  analyticsMenuItems,
  composeMenuItems,
  libraryMenuItems,
  menuItems,
  orgMenuItems,
  researchMenuItems,
  secondaryMenuItems,
  settingsMenuItems,
  studioMenuItems,
  workflowsMenuItems,
  conversationActions,
  renderConversations,
  onOpenCommandPalette,
}: Props) {
  const { href: buildHref, orgHref } = useOrgUrl();
  const orgSwitcherSlot = <OrganizationSwitcher />;
  const collapseProps = { isCollapsed, onToggleCollapse };

  if (isFocusedOnboardingRoute) {
    return null;
  }

  if (isLibraryRoute) {
    return (
      <AppSidebar
        items={libraryMenuItems}
        logoHref={withTaskContextHref(
          buildHref(LIBRARY_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Library"
        shellChromeVariant={shellChromeVariant}
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
      />
    );
  }

  if (isStudioRoute) {
    return (
      <AppSidebar
        items={studioMenuItems}
        logoHref={withTaskContextHref(
          buildHref(STUDIO_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Studio"
        shellChromeVariant={shellChromeVariant}
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
      />
    );
  }

  if (isAdminRoute) {
    return (
      <AdminSidebar
        items={adminMenuItems}
        logoHref={withTaskContextHref(ADMIN_LOGO_HREF, taskContextSearchParams)}
        {...collapseProps}
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
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
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
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
      />
    );
  }

  if (isEditorRoute) {
    return (
      <AppSidebar
        items={[]}
        logoHref={withTaskContextHref(
          buildHref(APP_ROUTES.WORKSPACE.OVERVIEW),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Editor"
        shellChromeVariant={shellChromeVariant}
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
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
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
      />
    );
  }

  if (isResearchRoute) {
    return (
      <AppSidebar
        items={researchMenuItems}
        logoHref={withTaskContextHref(
          buildHref(RESEARCH_LOGO_HREF),
          taskContextSearchParams,
        )}
        currentApp={currentApp}
        sectionLabel="Research"
        shellChromeVariant={shellChromeVariant}
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
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
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
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
        orgSwitcherSlot={orgSwitcherSlot}
        {...collapseProps}
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
      sectionLabel="Workspace"
      collapsedSidebarWidth={0}
      mobileSidebarWidth={isConversationRoute ? undefined : 304}
      orgSwitcherSlot={orgSwitcherSlot}
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
              <AgentSidebarContent
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
      {...collapseProps}
    />
  );
}
