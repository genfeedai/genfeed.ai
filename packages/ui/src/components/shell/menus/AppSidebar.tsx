'use client';

import type {
  BaseMenuProps,
  MenuPrimaryActionConfig,
  MenuSharedProps,
  MenuShellConfig,
} from '@genfeedai/props/navigation/menu.props';
import MenuShared from '@ui/menus/shared/MenuShared';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

export interface AppSidebarProps extends BaseMenuProps {
  renderTopSlot?: MenuSharedProps['renderTopSlot'];

  renderBody?: () => ReactNode;
  renderAfterNavigation?: MenuSharedProps['renderAfterNavigation'];
  backHref?: string;
  backLabel?: string;
  collapsedSidebarWidth?: MenuSharedProps['collapsedSidebarWidth'];
  currentApp?: MenuSharedProps['currentApp'];
  mobileSidebarWidth?: MenuSharedProps['mobileSidebarWidth'];
  primaryAction?: MenuPrimaryActionConfig;
  secondaryItems?: MenuShellConfig['secondaryItems'];
  sectionLabel?: string;
  isCollapsed?: MenuSharedProps['isCollapsed'];
  showPrimaryItems?: MenuSharedProps['showPrimaryItems'];
  sidebarWidth?: MenuSharedProps['sidebarWidth'];
  conversationActions?: MenuSharedProps['conversationActions'];
  renderFooterSlot?: MenuSharedProps['renderFooterSlot'];
  showUserProfile?: MenuSharedProps['showUserProfile'];
  orgSwitcherSlot?: MenuSharedProps['orgSwitcherSlot'];
  items: MenuShellConfig['items'];
}

export default function AppSidebar({
  onClose,
  renderTopSlot,
  renderBody,
  renderAfterNavigation,
  backHref,
  backLabel,
  collapsedSidebarWidth,
  currentApp,
  mobileSidebarWidth,
  primaryAction,
  secondaryItems,
  sectionLabel,
  isCollapsed,
  showPrimaryItems,
  sidebarWidth,
  conversationActions,
  renderFooterSlot,
  showUserProfile = false,
  orgSwitcherSlot,
  items,
}: AppSidebarProps) {
  const config = useMemo<MenuShellConfig>(
    () => ({
      items,
      logoHref: '/',
      primaryAction,
      secondaryItems,
    }),
    [items, primaryAction, secondaryItems],
  );

  return (
    <MenuShared
      collapsedSidebarWidth={collapsedSidebarWidth}
      config={config}
      currentApp={currentApp}
      mobileSidebarWidth={mobileSidebarWidth}
      onClose={onClose}
      renderTopSlot={renderTopSlot}
      renderBody={renderBody}
      renderAfterNavigation={renderAfterNavigation}
      backHref={backHref}
      backLabel={backLabel}
      sectionLabel={sectionLabel}
      isCollapsed={isCollapsed}
      showPrimaryItems={showPrimaryItems}
      sidebarWidth={sidebarWidth}
      conversationActions={conversationActions}
      renderFooterSlot={renderFooterSlot}
      showUserProfile={showUserProfile}
      orgSwitcherSlot={orgSwitcherSlot}
    />
  );
}
