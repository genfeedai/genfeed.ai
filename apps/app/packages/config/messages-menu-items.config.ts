import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { Inbox, MessageCircleReply, MessageSquare, Send } from 'lucide-react';

/**
 * Messages module nav — engagement inbox + send-side sequences.
 *
 * - Inbox: comments + DMs (conversation list fills the nav panel body)
 * - Outreach sequences: growth / launch DM pipelines
 * - Replies: author replies on your own posts
 * - Reply drip: throttled outbound reply sequences
 *
 * Icons: one unique lucide glyph per row.
 */
export const MESSAGES_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.MESSAGES.ROOT,
    isExactMatch: true,
    label: 'Inbox',
    matchPaths: [APP_ROUTES.MESSAGES.ROOT],
    outline: Inbox,
    solid: Inbox,
  },
  {
    group: 'Engage',
    href: APP_ROUTES.MESSAGES.OUTREACH,
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
    label: 'Replies',
    matchPaths: [APP_ROUTES.MESSAGES.REPLIES],
    outline: MessageCircleReply,
    solid: MessageCircleReply,
  },
  {
    group: 'Engage',
    href: APP_ROUTES.MESSAGES.REPLY_DRIP,
    label: 'Reply drip',
    matchPaths: [APP_ROUTES.MESSAGES.REPLY_DRIP],
    outline: MessageSquare,
    solid: MessageSquare,
  },
];

export const MESSAGES_LOGO_HREF = APP_ROUTES.MESSAGES.ROOT;
