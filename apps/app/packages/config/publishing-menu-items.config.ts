import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  Calendar,
  ClipboardCheck,
  Files,
  Flag,
  LayoutDashboard,
  Rows3,
} from 'lucide-react';

/**
 * Publishing owns the content desk + go-live lifecycle.
 *
 * Flat bar: Overview · Posts · Content · Review · Calendar · Campaigns.
 * Posts is the single social-post lifecycle list — every lifecycle state
 * (draft, scheduled, pending, processing, published, failed) is a query-param
 * filter on that one route (see `createPublishingPostsFilterRoute`), never a
 * dedicated nav item. Content is the type-aware library (posts + articles +
 * newsletters). Review is the approval queue, a distinct surface from the
 * Posts draft filter. Campaigns are named content programs over those desks.
 *
 * Agent Programs → Automation. Outreach / reply drip → Messages.
 * Remix → Discovery/Library action only.
 * Newsletter writing → Agent; only its go-live lifecycle belongs here.
 */
export const PUBLISHING_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.PUBLISHING.OVERVIEW, APP_ROUTES.PUBLISHING.ROOT],
    outline: LayoutDashboard,
    solid: LayoutDashboard,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.PUBLISHING.POSTS],
    outline: Rows3,
    solid: Rows3,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.CONTENT,
    label: 'Content',
    matchPaths: [APP_ROUTES.PUBLISHING.CONTENT],
    outline: Files,
    solid: Files,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.REVIEW,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISHING.REVIEW],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.PUBLISHING.CALENDAR],
    outline: Calendar,
    solid: Calendar,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.CAMPAIGNS,
    label: 'Campaigns',
    matchPaths: [
      APP_ROUTES.PUBLISHING.CAMPAIGNS,
      APP_ROUTES.PUBLISHING.CAMPAIGNS_NEW,
    ],
    outline: Flag,
    solid: Flag,
  },
];
