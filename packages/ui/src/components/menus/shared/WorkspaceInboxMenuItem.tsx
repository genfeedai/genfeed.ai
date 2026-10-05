'use client';

import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { useWorkspaceInboxCount } from '@genfeedai/hooks/data/tasks/use-workspace-inbox-count';
import MenuItem from '@ui/menus/item/MenuItem';
import { useTranslations } from 'next-intl';

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
  const translate = useTranslations('common.notificationInbox');
  const actionableCount = useWorkspaceInboxCount();

  return (
    <MenuItem
      badgeCount={actionableCount}
      badgeKind="dot"
      badgeLabel={translate('unread')}
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
