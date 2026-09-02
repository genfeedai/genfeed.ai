import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Inbox, MessageCircleReply, MessageSquare, Send } from 'lucide-react';

/**
 * Messages module nav — engagement inbox + send-side sequences.
 *
 * - Inbox: comments + DMs (conversation list fills the nav panel body)
 * - Outreach sequences: growth / launch DM pipelines
 * - Replies: author replies on your own posts
 * - Reply drip: throttled outbound reply sequences
 *
 * `isPrimary` keeps these destinations visible above the inbox panel body.
 * Org-level routes (`/:org/~/messages`) only ship Inbox. Items with
 * `hrefScope: 'brand'` stay off organization navigation or they 404.
 *
 * Icons: one unique lucide glyph per row.
 */
export const MESSAGES_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.MESSAGES.ROOT,
    hrefScope: 'organization',
    isExactMatch: true,
    isPrimary: true,
    label: 'Inbox',
    matchPaths: [APP_ROUTES.MESSAGES.ROOT],
    outline: Inbox,
    solid: Inbox,
  },
  {
    group: 'Engage',
    href: APP_ROUTES.MESSAGES.OUTREACH,
    hrefScope: 'brand',
    isPrimary: true,
    label: 'Outreach sequences',
    matchPaths: [
      APP_ROUTES.MESSAGES.OUTREACH,
      APP_ROUTES.MESSAGES.OUTREACH_NEW,
    ],
    outline: Send,
    solid: Send,
  },
  {
    group: 'Engage',
    href: APP_ROUTES.MESSAGES.REPLIES,
    hrefScope: 'brand',
    isPrimary: true,
    label: 'Replies',
    matchPaths: [APP_ROUTES.MESSAGES.REPLIES],
    outline: MessageCircleReply,
    solid: MessageCircleReply,
  },
  {
    group: 'Engage',
    href: APP_ROUTES.MESSAGES.REPLY_DRIP,
    hrefScope: 'brand',
    isPrimary: true,
    label: 'Reply drip',
    matchPaths: [APP_ROUTES.MESSAGES.REPLY_DRIP],
    outline: MessageSquare,
    solid: MessageSquare,
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
