import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { PostCard } from '@ui/primitives/animated-icons/custom-lucide';
import { Gauge, Route } from 'lucide-react';

/**
 * Posts owns social posts, articles, and newsletters with type and status
 * filters. Calendar and approvals are Posts views (#5502), not nav items.
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
