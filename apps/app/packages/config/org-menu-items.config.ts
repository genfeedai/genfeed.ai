import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Bot, ChartPie, Gauge } from 'lucide-react';

export const ORG_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.WORKSPACE.OVERVIEW,
    label: 'Overview',
    matchPaths: [APP_ROUTES.WORKSPACE.OVERVIEW, APP_ROUTES.WORKSPACE.ROOT],
    outline: Gauge,
    solid: Gauge,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Analytics',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: ChartPie,
    solid: ChartPie,
  },
  {
    group: '',
    href: APP_ROUTES.AGENT.ROOT,
    label: 'Agent',
    matchPaths: [APP_ROUTES.AGENT.ROOT],
    outline: Bot,
    solid: Bot,
  },
];
