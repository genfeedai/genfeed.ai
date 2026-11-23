import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { BadgePercent, ChartLine, Newspaper } from 'lucide-react';

export const DISCOVERY_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.FEED,
    label: 'Feed',
    matchPaths: [APP_ROUTES.DISCOVERY.ROOT, APP_ROUTES.DISCOVERY.FEED],
    outline: Newspaper,
    solid: Newspaper,
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
    href: APP_ROUTES.DISCOVERY.ADS,
    label: 'Ads',
    matchPaths: [APP_ROUTES.DISCOVERY.ADS],
    outline: BadgePercent,
    solid: BadgePercent,
  },
];
