'use client';

import type { MenuConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import MenuShared from '@ui/menus/shared/MenuShared';
import { useMemo } from 'react';

export interface AdminSidebarProps extends Partial<MenuSharedProps> {
  items: MenuConfig['items'];
  logoHref?: string;
}

export default function AdminSidebar({
  onClose,
  isCollapsed,
  onToggleCollapse,
  items,
  logoHref = '/',
}: AdminSidebarProps) {
  const config = useMemo<MenuConfig>(
    () => ({
      items: items.map((item) => ({
        ...item,
        hrefScope: 'global',
      })),
      logoHref,
    }),
    [items, logoHref],
  );

  return (
    <MenuShared
      config={config}
      onClose={onClose}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}
