'use client';

import { SettingsSurface } from '@genfeedai/contracts';
import { APP_DISPLAY_LABELS } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SIDEBAR_DEFAULT_WIDTH } from '@/components/layouts/app/app-layout.utils';
import SidebarActionTrigger from '@/components/menus/sidebar-action-trigger/SidebarActionTrigger';
import SidebarSearchTrigger from '@/components/menus/sidebar-search-trigger/SidebarSearchTrigger';
import AppSidebar from '@/components/shell/menus/AppSidebar';
import type { SettingsScope } from '@/config/settings-menu-items.config';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type {
  MenuSharedProps,
  SidebarNavPanel,
} from '@/props/navigation/menu.props';
import { useOpenTaskComposer } from './useOpenTaskComposer';

type AppSidebarSurface = {
  active: boolean;
  items: MenuItemConfig[];
  currentApp?: MenuSharedProps['currentApp'];
  sectionLabel?: string;
};

type Props = {
  currentApp?: MenuSharedProps['currentApp'];
  isCollapsed?: MenuSharedProps['isCollapsed'];
  onClose?: MenuSharedProps['onClose'];
  onToggleCollapse?: MenuSharedProps['onToggleCollapse'];
  /**
   * Live rail width from AppLayout (resize + localStorage). Must be accepted
   * here — cloneElement injects it; hardcoding 280 leaves MenuShared stuck
   * while DesktopSidebar and --desktop-sidebar-width track the drag.
   */
  sidebarWidth?: MenuSharedProps['sidebarWidth'];
  isAdminRoute: boolean;
  isAnalyticsRoute: boolean;
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
   */
  navPanel?: SidebarNavPanel | null;
};

export default function AppProtectedLayoutSidebar({
  currentApp,
  isCollapsed,
  onClose,
  onToggleCollapse,
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
  isAdminRoute,
  isAnalyticsRoute,
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
}: Props) {
  const translate = useTranslations('common.sidebar');
  const openTaskComposer = useOpenTaskComposer();
  // Browsers reserve ⌘⇧N (incognito window), so only the desktop app has it.
  const isDesktop = useIsDesktopClient();
  const newItemShortcut = isDesktop ? '⌘⇧N' : undefined;
  const sidebarStateProps = {
    isCollapsed,
    onClose,
    onToggleCollapse,
  };

  const renderQuickActions = () => (
    <>
      <SidebarActionTrigger
        ariaLabel={translate('newTaskAriaLabel')}
        icon={<Plus className="size-4 flex-shrink-0" />}
        label={translate('newTask')}
        onClick={openTaskComposer}
        shortcut={newItemShortcut}
        testId="sidebar-primary-action"
      />
      <SidebarSearchTrigger label={translate('search')} />
    </>
  );

  // A module owns the nav column by handing the shell a panel: the surface
  // keeps its logo, label, switchers and primary destinations, and the panel
  // takes the place of its grouped menu items. Nothing here knows what the
  // panel renders.
  const navPanelProps = navPanel
    ? {
        collapsedSidebarWidth: 0,
        renderBody: navPanel.render,
        showPrimaryItems: true,
      }
    : null;

  const surface = (
    [
      {
        active: isLibraryRoute,
        currentApp,
        items: libraryMenuItems,
        sectionLabel: 'Library',
      },
      {
        active: isStudioRoute,
        currentApp,
        items: studioMenuItems,
        // Each Studio tool is its own app; there is no Studio parent label.
        sectionLabel: currentApp ? APP_DISPLAY_LABELS[currentApp] : undefined,
      },
      {
        active: isAdminRoute,
        items: adminMenuItems,
      },
      {
        active: isPublishingRoute,
        currentApp,
        items: publishingMenuItems,
        sectionLabel: APP_DISPLAY_LABELS.publishing,
      },
      {
        active: isAutomationRoute,
        currentApp,
        items: automationMenuItems,
        sectionLabel: APP_DISPLAY_LABELS.automation,
      },
      {
        active: isMessagesRoute,
        currentApp,
        items: messagesMenuItems,
        sectionLabel: 'Messages',
      },
      {
        active: isAnalyticsRoute,
        currentApp,
        items: analyticsMenuItems,
        sectionLabel: 'Analytics',
      },
      {
        active: isDiscoveryRoute,
        currentApp,
        items: discoveryMenuItems,
        sectionLabel: APP_DISPLAY_LABELS.discovery,
      },
      {
        active: isOrgRoute,
        currentApp,
        items: orgMenuItems,
        sectionLabel: 'Organization',
      },
      {
        active: isSettingsRoute,
        currentApp,
        items: settingsMenuItems,
        // No top-level "Settings" title. Group labels (Organization / Access,
        // Brand / Automation) are enough. The brand switcher is in the topbar.
        sectionLabel: undefined,
      },
    ] satisfies AppSidebarSurface[]
  ).find(({ active }) => active);

  if (surface) {
    return (
      <AppSidebar
        {...sidebarStateProps}
        currentApp={surface.currentApp}
        items={surface.items}
        sectionLabel={navPanel ? navPanel.sectionLabel : surface.sectionLabel}
        sidebarWidth={sidebarWidth}
        {...navPanelProps}
        renderTopSlot={renderQuickActions}
      />
    );
  }

  return (
    <AppSidebar
      {...sidebarStateProps}
      currentApp={currentApp}
      items={menuItems}
      sectionLabel={translate('workspace')}
      collapsedSidebarWidth={0}
      mobileSidebarWidth={304}
      renderTopSlot={renderQuickActions}
      secondaryItems={secondaryMenuItems}
      showPrimaryItems
      sidebarWidth={sidebarWidth}
    />
  );
}
