import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { AtSign, LayoutGrid, Megaphone, TrendingUp } from 'lucide-react';

export const DISCOVER_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.DISCOVER.OVERVIEW,
    label: 'Overview',
    matchPaths: [
      APP_ROUTES.DISCOVER.ROOT,
      APP_ROUTES.DISCOVER.OVERVIEW,
      APP_ROUTES.DISCOVER.DISCOVERY,
    ],
    outline: TrendingUp,
    solid: TrendingUp,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVER.SOCIALS,
    label: 'Socials',
    matchPaths: [
      APP_ROUTES.DISCOVER.SOCIALS,
      // Platform deep-links live under Socials (X, IG, …) — not Following.
      '/discover/twitter',
      '/discover/instagram',
      '/discover/youtube',
      '/discover/tiktok',
      '/discover/linkedin',
      '/discover/reddit',
      '/discover/pinterest',
    ],
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVER.FOLLOWING,
    label: 'Following',
    matchPaths: [APP_ROUTES.DISCOVER.FOLLOWING],
    outline: AtSign,
    solid: AtSign,
  },
  {
    group: '',
    href: APP_ROUTES.DISCOVER.ADS,
    label: 'Ads',
    matchPaths: [
      APP_ROUTES.DISCOVER.ADS,
      APP_ROUTES.DISCOVER.ADS_GOOGLE,
      APP_ROUTES.DISCOVER.ADS_META,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
];

export const DISCOVER_LOGO_HREF = APP_ROUTES.DISCOVER.OVERVIEW;
