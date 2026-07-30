import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { LayoutGrid, Megaphone, TrendingUp } from 'lucide-react';

export const RESEARCH_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.RESEARCH.DISCOVERY,
    label: 'Discovery',
    matchPaths: [APP_ROUTES.RESEARCH.ROOT, APP_ROUTES.RESEARCH.DISCOVERY],
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.RESEARCH.SOCIALS,
    label: 'Socials',
    matchPaths: [APP_ROUTES.RESEARCH.SOCIALS],
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: '',
    href: APP_ROUTES.RESEARCH.ADS,
    label: 'Ads',
    matchPaths: [
      APP_ROUTES.RESEARCH.ADS,
      APP_ROUTES.RESEARCH.ADS_GOOGLE,
      APP_ROUTES.RESEARCH.ADS_META,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
];

export const RESEARCH_LOGO_HREF = APP_ROUTES.RESEARCH.DISCOVERY;
