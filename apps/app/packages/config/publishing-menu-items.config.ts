import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { ClipboardCheck, Flag, LayoutDashboard, Rows3 } from 'lucide-react';

/** Posts owns social posts, articles, and newsletters with type and status filters. */
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
    href: APP_ROUTES.PUBLISHING.REVIEW,
    label: 'Review',
    matchPaths: [APP_ROUTES.PUBLISHING.REVIEW],
    outline: ClipboardCheck,
    solid: ClipboardCheck,
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
