'use client';

import type {
  BaseMenuProps,
  MenuPrimaryActionConfig,
  MenuSharedProps,
  MenuShellConfig,
} from '@props/navigation/menu.props';
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
  mobileSidebarWidth?: MenuSharedProps['mobileSidebarWidth'];
  primaryAction?: MenuPrimaryActionConfig;
  secondaryItems?: MenuShellConfig['secondaryItems'];
  sectionLabel?: string;
  shellMode?: 'default' | 'workspace';
  isCollapsed?: MenuSharedProps['isCollapsed'];
  shellChromeVariant?: MenuSharedProps['shellChromeVariant'];
  onToggleCollapse?: MenuSharedProps['onToggleCollapse'];
  showOrganizationSwitcher?: boolean;
  showPrimaryItems?: MenuSharedProps['showPrimaryItems'];
  sidebarWidth?: MenuSharedProps['sidebarWidth'];
  conversationActions?: MenuSharedProps['conversationActions'];
  items: MenuShellConfig['items'];
  logoHref?: string;
}

export default function AppSidebar({
  onClose,
  renderTopSlot,
  renderBody,
  renderAfterNavigation,
  backHref,
  backLabel,
  collapsedSidebarWidth,
  mobileSidebarWidth,
  primaryAction,
  secondaryItems,
  sectionLabel,
  shellMode = 'default',
  isCollapsed,
  shellChromeVariant,
  onToggleCollapse,
  showOrganizationSwitcher = false,
  showPrimaryItems,
  sidebarWidth,
  conversationActions,
  items,
  logoHref = '/',
}: AppSidebarProps) {
  const config = useMemo<MenuShellConfig>(
    () => ({
      brandRailMode: shellMode === 'workspace' ? 'workspace' : 'hidden',
      items,
      logoHref,
      primaryAction,
      secondaryItems,
      showOrganizationSwitcher,
    }),
    [
      items,
      logoHref,
      primaryAction,
      secondaryItems,
      shellMode,
      showOrganizationSwitcher,
    ],
  );

  return (
    <MenuShared
      collapsedSidebarWidth={collapsedSidebarWidth}
      config={config}
      mobileSidebarWidth={mobileSidebarWidth}
      onClose={onClose}
      renderTopSlot={renderTopSlot}
      renderBody={renderBody}
      renderAfterNavigation={renderAfterNavigation}
      backHref={backHref}
      backLabel={backLabel}
      sectionLabel={sectionLabel}
      isCollapsed={isCollapsed}
      shellChromeVariant={shellChromeVariant}
      onToggleCollapse={onToggleCollapse}
      showPrimaryItems={showPrimaryItems}
      sidebarWidth={sidebarWidth}
      conversationActions={conversationActions}
    />
  );
}
