import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Calendar,
  ClipboardCheck,
  LayoutDashboard,
  List,
  Rows3,
  Send,
} from 'lucide-react';

/**
 * Publish owns the content desk + go-live lifecycle.
 *
 * Top: Overview · Posts · Calendar
 * Pipeline: Review · Drafts · Published (status shortcuts into the desk)
 *
 * Campaigns / outreach → Automate. Remix → Discover/Library action only.
 * Newsletter writing → Agent; only its go-live lifecycle belongs here.
 */
export const PUBLISH_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.PUBLISH.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.PUBLISH.OVERVIEW, APP_ROUTES.PUBLISH.ROOT],
    outline: LayoutDashboard,
    solid: LayoutDashboard,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.PUBLISH.POSTS],
    outline: Rows3,
    solid: Rows3,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.PUBLISH.CALENDAR],
    outline: Calendar,
    solid: Calendar,
  },
  {
    group: 'Pipeline',
    href: APP_ROUTES.PUBLISH.REVIEW,
    isCollapsible: true,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISH.REVIEW],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: 'Pipeline',
    href: APP_ROUTES.PUBLISH.SCHEDULED,
    label: 'Drafts',
    matchPaths: [APP_ROUTES.PUBLISH.SCHEDULED],
    outline: List,
    solid: List,
  },
  {
    group: 'Pipeline',
    href: APP_ROUTES.PUBLISH.PUBLISHED,
    label: 'Published',
    matchPaths: [APP_ROUTES.PUBLISH.PUBLISHED],
    outline: Send,
    solid: Send,
  },
];

export const PUBLISH_LOGO_HREF = APP_ROUTES.PUBLISH.OVERVIEW;
