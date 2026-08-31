import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { ChartColumn, LayoutGrid, MessageSquare } from 'lucide-react';

export const ORG_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.WORKSPACE.OVERVIEW,
    label: 'Overview',
    matchPaths: [
      APP_ROUTES.OVERVIEW.ROOT,
      APP_ROUTES.WORKSPACE.ROOT,
      APP_ROUTES.WORKSPACE.OVERVIEW,
    ],
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: '',
    href: APP_ROUTES.ANALYTICS.OVERVIEW,
    label: 'Analytics',
    matchPaths: [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
    outline: ChartColumn,
    solid: ChartColumn,
  },
  {
    group: '',
    href: APP_ROUTES.AGENT.ROOT,
    label: 'Agent',
    matchPaths: [APP_ROUTES.AGENT.ROOT],
    outline: MessageSquare,
    solid: MessageSquare,
  },
];
