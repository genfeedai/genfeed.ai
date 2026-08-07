import { APP_ROUTES } from '@genfeedai/constants';
import {
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  RedditIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { AtSign, LayoutGrid, Megaphone, TrendingUp } from 'lucide-react';

/**
 * Discover sidebar: module peers + platform feeds as real menu items.
 *
 * Platform destinations used to live only as topbar pills under Socials.
 * Feeds are destinations — they belong in the section menu next to Overview /
 * Socials / Following / Ads, not as rounded filter chips.
 */
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
    isExactMatch: true,
    label: 'Socials',
    matchPaths: [APP_ROUTES.DISCOVER.SOCIALS],
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: 'Platforms',
    href: '/discover/twitter',
    isCollapsible: true,
    label: 'X',
    matchPaths: ['/discover/twitter'],
    outline: XTwitterIcon,
    solid: XTwitterIcon,
  },
  {
    group: 'Platforms',
    href: '/discover/instagram',
    label: 'Instagram',
    matchPaths: ['/discover/instagram'],
    outline: InstagramIcon,
    solid: InstagramIcon,
  },
  {
    group: 'Platforms',
    href: '/discover/youtube',
    label: 'YouTube',
    matchPaths: ['/discover/youtube'],
    outline: YoutubeIcon,
    solid: YoutubeIcon,
  },
  {
    group: 'Platforms',
    href: '/discover/tiktok',
    label: 'TikTok',
    matchPaths: ['/discover/tiktok'],
    outline: TiktokIcon,
    solid: TiktokIcon,
  },
  {
    group: 'Platforms',
    href: '/discover/linkedin',
    label: 'LinkedIn',
    matchPaths: ['/discover/linkedin'],
    outline: LinkedinIcon,
    solid: LinkedinIcon,
  },
  {
    group: 'Platforms',
    href: '/discover/reddit',
    label: 'Reddit',
    matchPaths: ['/discover/reddit'],
    outline: RedditIcon,
    solid: RedditIcon,
  },
  {
    group: 'Platforms',
    href: '/discover/pinterest',
    label: 'Pinterest',
    matchPaths: ['/discover/pinterest'],
    outline: PinterestIcon,
    solid: PinterestIcon,
  },
  {
    group: '',
    hasDividerAbove: true,
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
      APP_ROUTES.DISCOVER.ADS_TIKTOK,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
];

export const DISCOVER_LOGO_HREF = APP_ROUTES.DISCOVER.OVERVIEW;
