import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  BadgePercent,
  ChartLine,
  Gauge,
  RefreshCcw,
  UserRoundPlus,
} from 'lucide-react';

export const DISCOVERY_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.DISCOVERY.ROOT, APP_ROUTES.DISCOVERY.OVERVIEW],
    matchSearchParams: { source: null },
    outline: Gauge,
    solid: Gauge,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.FOLLOWING,
    label: 'Following',
    matchPaths: [APP_ROUTES.DISCOVERY.FOLLOWING],
    outline: UserRoundPlus,
    solid: UserRoundPlus,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.TRENDS,
    label: 'Trends',
    matchPaths: [APP_ROUTES.DISCOVERY.TRENDS],
    outline: ChartLine,
    solid: ChartLine,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.TREND_TURNOVER,
    label: 'Trend Turnover',
    matchPaths: [APP_ROUTES.DISCOVERY.TREND_TURNOVER],
    outline: RefreshCcw,
    solid: RefreshCcw,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.ADS,
    label: 'Ads',
    matchPaths: [APP_ROUTES.DISCOVERY.ADS],
    outline: BadgePercent,
    solid: BadgePercent,
  },
];
