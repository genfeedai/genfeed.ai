'use client';

import { useWorkspaceInboxCount } from '@genfeedai/hooks/data/tasks/use-workspace-inbox-count';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';

import MenuItem from '@ui/menus/item/MenuItem';

export default function WorkspaceInboxMenuItem({
  href,
  isActive,
  isComingSoon,
  label,
  onClick,
  outline,
  solid,
}: {
  href?: string;
  isActive: boolean;
  isComingSoon?: boolean;
  label: string;
  onClick?: () => void;
  outline?: MenuItemConfig['outline'];
  solid?: MenuItemConfig['solid'];
}) {
  const actionableCount = useWorkspaceInboxCount();

  return (
    <MenuItem
      badgeCount={actionableCount}
      href={href}
      isActive={isActive}
      isCollapsed={false}
      isComingSoon={isComingSoon}
      label={label}
      onClick={onClick}
      outline={outline}
      solid={solid}
      variant="icon"
    />
  );
}
