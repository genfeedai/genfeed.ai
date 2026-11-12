'use client';

import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { useTranslations } from 'next-intl';
import MenuItem from '@/components/menus/item/MenuItem';
import { useUnreadActivityCount } from '@/hooks/data/activities/use-unread-activity-count';

export default function WorkspaceActivityMenuItem({
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
  const unreadCount = useUnreadActivityCount();

  return (
    <MenuItem
      badgeCount={unreadCount}
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
