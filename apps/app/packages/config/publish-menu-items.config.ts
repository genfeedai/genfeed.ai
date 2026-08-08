import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Calendar,
  ClipboardCheck,
  LayoutDashboard,
  List,
  Send,
} from 'lucide-react';

// Publish owns post lifecycle only: dashboard, approval queue, lists, calendar.
// Campaigns / outreach live under Automate. Remix is a Discover/Library action
// (deep link only). Newsletter is a creation surface — not Publish nav.
// No Analytics entry: the Analytics module owns measurement (`/analytics/posts`).
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
    href: APP_ROUTES.PUBLISH.REVIEW,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISH.REVIEW],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.SCHEDULED,
    label: 'Scheduled',
    matchPaths: [APP_ROUTES.PUBLISH.SCHEDULED],
    outline: List,
    solid: List,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.PUBLISHED,
    label: 'Published',
    matchPaths: [APP_ROUTES.PUBLISH.PUBLISHED],
    outline: Send,
    solid: Send,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISH.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.PUBLISH.CALENDAR],
    outline: Calendar,
    solid: Calendar,
  },
];

export const PUBLISH_LOGO_HREF = APP_ROUTES.PUBLISH.OVERVIEW;
