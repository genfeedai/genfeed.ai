import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { AtSign, Flame, Megaphone, Repeat, TrendingUp } from 'lucide-react';

export const DISCOVERY_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.DISCOVERY.ROOT, APP_ROUTES.DISCOVERY.OVERVIEW],
    matchSearchParams: { source: null },
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.FOLLOWING,
    label: 'Following',
    matchPaths: [APP_ROUTES.DISCOVERY.FOLLOWING],
    outline: AtSign,
    solid: AtSign,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.TRENDS,
    label: 'Trends',
    matchPaths: [APP_ROUTES.DISCOVERY.TRENDS],
    outline: Flame,
    solid: Flame,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.TREND_TURNOVER,
    label: 'Trend Turnover',
    matchPaths: [APP_ROUTES.DISCOVERY.TREND_TURNOVER],
    outline: Repeat,
    solid: Repeat,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.ADS,
    label: 'Ads',
    matchPaths: [APP_ROUTES.DISCOVERY.ADS],
    outline: Megaphone,
    solid: Megaphone,
  },
];
