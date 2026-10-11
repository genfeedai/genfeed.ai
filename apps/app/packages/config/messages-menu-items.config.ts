import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Inbox, LayoutDashboard } from 'lucide-react';

/**
 * Messages module nav (#5502): Overview and a conversation-first Inbox.
 *
 * - Overview: waiting conversations per kind, each opening a filtered Inbox
 * - Inbox: DMs, Replies and Comments in one stream, filtered by type
 *
 * Outreach sequences, the author-reply bot and Reply drip left this menu;
 * their routes stay until their destination is decided. Both items exist at
 * brand and organization scope, so neither sets hrefScope.
 *
 * Icons: one unique lucide glyph per row.
 */
export const MESSAGES_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.MESSAGES.OVERVIEW,
    isExactMatch: true,
    isPrimary: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.MESSAGES.OVERVIEW],
    outline: LayoutDashboard,
    solid: LayoutDashboard,
  },
  {
    group: '',
    href: APP_ROUTES.MESSAGES.ROOT,
    isExactMatch: true,
    isPrimary: true,
    label: 'Inbox',
    matchPaths: [APP_ROUTES.MESSAGES.ROOT],
    outline: Inbox,
    solid: Inbox,
  },
];

/** True when the operator is on org messages (`/:org/~/messages…`), not brand. */
export function isOrgMessagesRouteScope(
  brandSlug: string | null | undefined,
): boolean {
  const normalized = brandSlug?.trim() ?? '';
  return normalized === '' || normalized === '~';
}

/** Menu items that exist for the current org vs brand messages scope. */
export function getMessagesMenuItemsForScope(
  brandSlug: string | null | undefined,
): MenuItemConfig[] {
  if (!isOrgMessagesRouteScope(brandSlug)) {
    return MESSAGES_MENU_ITEMS;
  }

  return MESSAGES_MENU_ITEMS.filter((item) => item.hrefScope !== 'brand').map(
    (item) => ({
      ...item,
      group: undefined,
    }),
  );
}
