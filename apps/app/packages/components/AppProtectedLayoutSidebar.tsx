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
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSaaS } from '@genfeedai/config/deployment';
import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import AppSidebar from '@ui/shell/menus/AppSidebar';
import type { ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';
import { withTaskContextHref } from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import AgentSidebarContent from './AppProtectedLayoutAgentSidebar';

type ShellChromeVariant = 'default';

type TaskContextSearchParams = URLSearchParams;

type AppSidebarSurface = {
  active: boolean;
  items: MenuItemConfig[];
  logoHref: string;
  currentApp?: MenuSharedProps['currentApp'];
  sectionLabel?: string;
  showOrgSwitcher?: boolean;
  showUserProfile?: boolean;
};

type Props = {
  shellChromeVariant: ShellChromeVariant;
  taskContextSearchParams: TaskContextSearchParams;
  currentApp?: MenuSharedProps['currentApp'];
  isCollapsed?: MenuSharedProps['isCollapsed'];
  onToggleCollapse?: MenuSharedProps['onToggleCollapse'];
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
  isUniversalWorkspaceShell?: boolean;
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
  isCollapsed,
  onToggleCollapse,
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
  isUniversalWorkspaceShell = false,
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
  const { settings } = useBrand();
  // Canonical switcher rule (ADR-DEPLOYMENT-MODES): the org switcher only
  // renders in SaaS. Community and Desktop are single-tenant (one org), so an
  // org switcher there can't switch anything. The brand switcher stays visible
  // in every mode. Regressed after #743 shipped when the switcher moved into
  // the sidebar (#1059) and dropped its cloud gate; re-applied here on the
  // canonical isSaaS() rather than a raw env read.
  const orgSwitcherSlot = isSaaS() ? (
    <OrganizationSwitcher subscriptionTier={settings?.subscriptionTier} />
  ) : undefined;
  const collapseProps = {
    isCollapsed,
    onToggleCollapse,
  };

  if (isFocusedOnboardingRoute) {
    return null;
  }

  const conversationSidebar = (
    <AppSidebar
      {...collapseProps}
      currentApp={currentApp}
      items={[]}
      logoHref={withTaskContextHref(
        buildHref(APP_LOGO_HREF),
        taskContextSearchParams,
      )}
      sectionLabel="Workspace"
      collapsedSidebarWidth={0}
      orgSwitcherSlot={orgSwitcherSlot}
      renderBody={() => (
        <AgentSidebarContent
          conversationActions={conversationActions}
          renderConversations={renderConversations}
        />
      )}
      shellMode="default"
      showPrimaryItems={false}
      shellChromeVariant={shellChromeVariant}
    />
  );

  if (isUniversalWorkspaceShell) {
    return conversationSidebar;
  }

  const surface = (
    [
      {
        active: isLibraryRoute,
        currentApp,
        items: libraryMenuItems,
        logoHref: buildHref(LIBRARY_LOGO_HREF),
        sectionLabel: 'Library',
        showOrgSwitcher: true,
      },
      {
        active: isStudioRoute,
        currentApp,
        items: studioMenuItems,
        logoHref: buildHref(STUDIO_LOGO_HREF),
        sectionLabel: 'Studio',
        showOrgSwitcher: true,
      },
      {
        active: isAdminRoute,
        items: adminMenuItems,
        logoHref: ADMIN_LOGO_HREF,
        showUserProfile: true,
      },
      {
        active: isComposeRoute,
        currentApp,
        items: composeMenuItems,
        logoHref: buildHref(COMPOSE_LOGO_HREF),
        sectionLabel: 'Compose',
        showOrgSwitcher: true,
      },
      {
        active: isWorkflowsRoute,
        currentApp,
        items: workflowsMenuItems,
        logoHref: buildHref(WORKFLOWS_LOGO_HREF),
        sectionLabel: 'Workflows',
        showOrgSwitcher: true,
      },
      {
        active: isEditorRoute,
        currentApp,
        items: [],
        logoHref: buildHref(APP_ROUTES.WORKSPACE.OVERVIEW),
        sectionLabel: 'Editor',
        showOrgSwitcher: true,
      },
      {
        active: isAnalyticsRoute,
        currentApp,
        items: analyticsMenuItems,
        logoHref: buildHref(ANALYTICS_LOGO_HREF),
        sectionLabel: 'Analytics',
        showOrgSwitcher: true,
      },
      {
        active: isResearchRoute,
        currentApp,
        items: researchMenuItems,
        logoHref: buildHref(RESEARCH_LOGO_HREF),
        sectionLabel: 'Research',
        showOrgSwitcher: true,
      },
      {
        active: isOrgRoute,
        currentApp,
        items: orgMenuItems,
        logoHref: orgHref(ORG_LOGO_HREF),
        sectionLabel: 'Organization',
        showOrgSwitcher: true,
      },
      {
        active: isSettingsRoute,
        currentApp,
        items: settingsMenuItems,
        logoHref: buildHref(SETTINGS_LOGO_HREF),
        sectionLabel: 'Settings',
        showOrgSwitcher: true,
      },
    ] satisfies AppSidebarSurface[]
  ).find(({ active }) => active);

  if (surface) {
    return (
      <AppSidebar
        {...collapseProps}
        currentApp={surface.currentApp}
        items={surface.items}
        logoHref={withTaskContextHref(
          surface.logoHref,
          taskContextSearchParams,
        )}
        sectionLabel={surface.sectionLabel}
        shellChromeVariant={shellChromeVariant}
        orgSwitcherSlot={surface.showOrgSwitcher ? orgSwitcherSlot : undefined}
        showUserProfile={surface.showUserProfile}
      />
    );
  }

  if (isConversationRoute) {
    return conversationSidebar;
  }

  return (
    <AppSidebar
      {...collapseProps}
      currentApp={currentApp}
      items={menuItems}
      logoHref={withTaskContextHref(
        buildHref(APP_LOGO_HREF),
        taskContextSearchParams,
      )}
      sectionLabel="Workspace"
      collapsedSidebarWidth={0}
      mobileSidebarWidth={304}
      orgSwitcherSlot={orgSwitcherSlot}
      renderTopSlot={() => (
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
      )}
      secondaryItems={secondaryMenuItems}
      shellMode="workspace"
      showPrimaryItems
      sidebarWidth={304}
      shellChromeVariant={shellChromeVariant}
    />
  );
}
