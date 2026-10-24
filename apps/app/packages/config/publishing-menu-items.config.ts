import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { PostCard } from '@ui/primitives/animated-icons/custom-lucide';
import { CalendarClock, Gauge, Gavel, Route } from 'lucide-react';

/**
 * Posts owns social posts, articles, and newsletters with type and status
 * filters. Calendar and Approvals are Posts views (`?view=`) that also get
 * their own entries here; the `view` query decides which entry is active.
 */
export const PUBLISHING_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.PUBLISHING.OVERVIEW, APP_ROUTES.PUBLISHING.ROOT],
    outline: Gauge,
    solid: Gauge,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.POSTS,
    label: 'Posts',
    matchPaths: [APP_ROUTES.PUBLISHING.POSTS],
    outline: PostCard,
    solid: PostCard,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.CALENDAR,
    label: 'Calendar',
    matchPaths: [APP_ROUTES.PUBLISHING.CALENDAR],
    matchSearchParams: { view: 'calendar' },
    outline: CalendarClock,
    solid: CalendarClock,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.REVIEW,
    label: 'Approvals',
    matchPaths: [APP_ROUTES.PUBLISHING.REVIEW],
    matchSearchParams: { view: 'approvals' },
    outline: Gavel,
    solid: Gavel,
  },
  {
    group: '',
    href: APP_ROUTES.PUBLISHING.CAMPAIGNS,
    label: 'Campaigns',
    matchPaths: [
      APP_ROUTES.PUBLISHING.CAMPAIGNS,
      APP_ROUTES.PUBLISHING.CAMPAIGNS_NEW,
    ],
    outline: Route,
    releaseItemId: 'campaigns',
    solid: Route,
  },
];
