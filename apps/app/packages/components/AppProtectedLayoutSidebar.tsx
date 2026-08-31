'use client';

import SettingsSearch from '@app-components/settings-search/SettingsSearch';
import type { SettingsScope } from '@app-config/settings-menu-items.config';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_DISPLAY_LABELS } from '@genfeedai/constants';
import { SettingsSurface } from '@genfeedai/enums';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type {
  MenuSharedProps,
  SidebarNavPanel,
} from '@genfeedai/props/navigation/menu.props';
import { SIDEBAR_DEFAULT_WIDTH } from '@ui/layouts/app/app-layout.utils';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import AppSidebar from '@ui/shell/menus/AppSidebar';
import { Plus } from 'lucide-react';

import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';

type AppSidebarSurface = {
  active: boolean;
  items: MenuItemConfig[];
  currentApp?: MenuSharedProps['currentApp'];
  sectionLabel?: string;
  showOrgSwitcher?: boolean;
  showUserProfile?: boolean;
};

type Props = {
  currentApp?: MenuSharedProps['currentApp'];
  isCollapsed?: MenuSharedProps['isCollapsed'];
  /**
   * Live rail width from AppLayout (resize + localStorage). Must be accepted
   * here — cloneElement injects it; hardcoding 280 leaves MenuShared stuck
   * while DesktopSidebar and --desktop-sidebar-width track the drag.
   */
  sidebarWidth?: MenuSharedProps['sidebarWidth'];
  isAdminRoute: boolean;
  isAnalyticsRoute: boolean;
  isConversationRoute: boolean;
  isFocusedOnboardingRoute: boolean;
  isLibraryRoute: boolean;
  isMessagesRoute?: boolean;
  isOrgRoute: boolean;
  isPublishingRoute: boolean;
  isDiscoveryRoute: boolean;
  isSettingsRoute: boolean;
  isStudioRoute: boolean;
  isAutomationRoute: boolean;
  /** Settings sidebar scope — brand routes omit the redundant "Settings" header. */
  settingsScope?: SettingsScope;
  adminMenuItems: MenuItemConfig[];
  analyticsMenuItems: MenuItemConfig[];
  libraryMenuItems: MenuItemConfig[];
  menuItems: MenuItemConfig[];
  orgMenuItems: MenuItemConfig[];
  publishingMenuItems: MenuItemConfig[];
  discoveryMenuItems: MenuItemConfig[];
  secondaryMenuItems: MenuItemConfig[];
  settingsMenuItems: MenuItemConfig[];
  studioMenuItems: MenuItemConfig[];
  automationMenuItems: MenuItemConfig[];
  messagesMenuItems: MenuItemConfig[];
  /**
   * Supplied by the module that owns the active surface. When present its body
   * replaces that surface's menu items — today the conversation's thread list,
   * later Library → collections and Workflows → runs.
   * Messages keeps primary destinations visible above the inbox panel body.
   */
  navPanel?: SidebarNavPanel | null;
  onOpenCommandPalette: () => void;
};

export default function AppProtectedLayoutSidebar({
  currentApp,
  isCollapsed,
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
  isAdminRoute,
  isAnalyticsRoute,
  isConversationRoute,
  isFocusedOnboardingRoute,
  isLibraryRoute,
  isMessagesRoute = false,
  isOrgRoute,
  isPublishingRoute,
  isDiscoveryRoute,
  isSettingsRoute,
  isStudioRoute,
  isAutomationRoute,
  settingsScope = SettingsSurface.PERSONAL,
  adminMenuItems,
  analyticsMenuItems,
  libraryMenuItems,
  menuItems,
  orgMenuItems,
  publishingMenuItems,
  discoveryMenuItems,
  secondaryMenuItems,
  settingsMenuItems,
  studioMenuItems,
  automationMenuItems,
  messagesMenuItems,
  navPanel,
  onOpenCommandPalette,
}: Props) {
  const { settings } = useBrand();
  // Canonical switcher rule (ADR-DEPLOYMENT-MODES): the org switcher is ALWAYS
  // visible because it is the entry point to org-scoped surfaces (settings,
  // brands, credits). Single-tenant modes still have exactly one org that a
  // user must be able to open, so hiding the switcher strands them. Multi-org
  // actions (create / switch) are gated INSIDE OrganizationSwitcher via
  // canCreateOrganization (active subscription + tier org limit); non-SaaS just
  // shows the current org with no create action. The brand switcher is
  // similarly always visible.
  const orgSwitcherSlot = (
    <OrganizationSwitcher subscriptionTier={settings?.subscriptionTier} />
  );
  const sidebarStateProps = {
    isCollapsed,
  };

  if (isFocusedOnboardingRoute) {
    return null;
  }

  // A module owns the nav column by handing the shell a panel: the surface
  // keeps its logo, label and switchers, and the panel takes the place of its
  // menu items. Nothing here knows what the panel renders.
  // Messages is the exception: destinations stay visible above the inbox body
  // so Outreach / Replies / Reply drip remain reachable from the inbox.
  const navPanelProps = navPanel
    ? {
        collapsedSidebarWidth: 0,
        items: isMessagesRoute
          ? messagesMenuItems
          : ([] satisfies MenuItemConfig[]),
        renderBody: navPanel.render,
        showPrimaryItems: isMessagesRoute,
      }
    : null;

  const surface = (
    [
      {
        active: isConversationRoute,
        currentApp,
        items: [],
        sectionLabel: 'Workspace',
        showOrgSwitcher: true,
      },
      {
        active: isLibraryRoute,
        currentApp,
        items: libraryMenuItems,
        sectionLabel: 'Library',
        showOrgSwitcher: true,
      },
      {
        active: isStudioRoute,
        currentApp,
        items: studioMenuItems,
        sectionLabel: 'Studio',
        showOrgSwitcher: true,
      },
      {
        active: isAdminRoute,
        items: adminMenuItems,
        showUserProfile: true,
      },
      {
        active: isPublishingRoute,
        currentApp,
        items: publishingMenuItems,
        sectionLabel: APP_DISPLAY_LABELS.publishing,
        showOrgSwitcher: true,
      },
      {
        active: isAutomationRoute,
        currentApp,
        items: automationMenuItems,
        sectionLabel: APP_DISPLAY_LABELS.automation,
        showOrgSwitcher: true,
      },
      {
        active: isMessagesRoute,
        currentApp,
        items: messagesMenuItems,
        sectionLabel: 'Messages',
        showOrgSwitcher: true,
      },
      {
        active: isAnalyticsRoute,
        currentApp,
        items: analyticsMenuItems,
        sectionLabel: 'Analytics',
        showOrgSwitcher: true,
      },
      {
        active: isDiscoveryRoute,
        currentApp,
        items: discoveryMenuItems,
        sectionLabel: APP_DISPLAY_LABELS.discovery,
        showOrgSwitcher: true,
      },
      {
        active: isOrgRoute,
        currentApp,
        items: orgMenuItems,
        sectionLabel: 'Organization',
        showOrgSwitcher: true,
      },
      {
        active: isSettingsRoute,
        currentApp,
        items: settingsMenuItems,
        // No top-level "Settings" shell header — org/brand switcher + group
        // labels (Organization / Access, Brand / Automation) are enough.
        sectionLabel: undefined,
        showOrgSwitcher: true,
      },
    ] satisfies AppSidebarSurface[]
  ).find(({ active }) => active);

  if (surface) {
    return (
      <AppSidebar
        {...sidebarStateProps}
        currentApp={surface.currentApp}
        items={surface.items}
        sectionLabel={navPanel?.sectionLabel ?? surface.sectionLabel}
        orgSwitcherSlot={surface.showOrgSwitcher ? orgSwitcherSlot : undefined}
        showUserProfile={surface.showUserProfile ?? true}
        sidebarWidth={sidebarWidth}
        {...navPanelProps}
        renderTopSlot={
          isSettingsRoute
            ? () => <SettingsSearch scope={settingsScope} />
            : undefined
        }
      />
    );
  }

  return (
    <AppSidebar
      {...sidebarStateProps}
      currentApp={currentApp}
      items={menuItems}
      sectionLabel="Workspace"
      collapsedSidebarWidth={0}
      mobileSidebarWidth={304}
      orgSwitcherSlot={orgSwitcherSlot}
      renderTopSlot={() => (
        <>
          <SidebarActionTrigger
            ariaLabel="Open new task modal"
            icon={<Plus className="size-4 flex-shrink-0" />}
            label="New Task"
            onClick={dispatchOpenTaskComposer}
            shortcut="⌘⇧N"
            testId="sidebar-primary-action"
          />
          <SidebarSearchTrigger onClick={onOpenCommandPalette} />
        </>
      )}
      secondaryItems={secondaryMenuItems}
      showPrimaryItems
      showUserProfile
      sidebarWidth={sidebarWidth}
    />
  );
}
