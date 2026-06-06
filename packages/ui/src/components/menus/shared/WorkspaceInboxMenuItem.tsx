'use client';

import { useOverviewBootstrap } from '@genfeedai/hooks/data/overview/use-overview-bootstrap';
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
  const { reviewInbox } = useOverviewBootstrap();
  const actionableCount =
    reviewInbox.pendingCount +
    reviewInbox.readyCount +
    reviewInbox.changesRequestedCount +
    reviewInbox.rejectedCount;

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
