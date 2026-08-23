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
import { AtSign, Megaphone, TrendingUp } from 'lucide-react';

/**
 * Discover sidebar: module peers + platform feeds as real menu items.
 *
 * Platform destinations used to live only as topbar pills under Socials.
 * Feeds are destinations — they belong in the section menu next to Overview /
 * Following / Ads, not as rounded filter chips.
 *
 * `/discover/socials` is retired (same TrendsList as Overview) and redirects
 * to `/discover/overview` — do not re-add a Socials peer here.
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
      APP_ROUTES.DISCOVER.SOCIALS,
    ],
    outline: TrendingUp,
    solid: TrendingUp,
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
      APP_ROUTES.DISCOVER.ADS_TIKTOK,
      APP_ROUTES.DISCOVER.ADS_X,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_TWITTER,
    isCollapsible: true,
    label: 'X',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_TWITTER],
    outline: XTwitterIcon,
    solid: XTwitterIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_INSTAGRAM,
    label: 'Instagram',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_INSTAGRAM],
    outline: InstagramIcon,
    solid: InstagramIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_YOUTUBE,
    label: 'YouTube',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_YOUTUBE],
    outline: YoutubeIcon,
    solid: YoutubeIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_TIKTOK,
    label: 'TikTok',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_TIKTOK],
    outline: TiktokIcon,
    solid: TiktokIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_LINKEDIN,
    label: 'LinkedIn',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_LINKEDIN],
    outline: LinkedinIcon,
    solid: LinkedinIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_REDDIT,
    label: 'Reddit',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_REDDIT],
    outline: RedditIcon,
    solid: RedditIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVER.PLATFORM_PINTEREST,
    label: 'Pinterest',
    matchPaths: [APP_ROUTES.DISCOVER.PLATFORM_PINTEREST],
    outline: PinterestIcon,
    solid: PinterestIcon,
  },
];

export const DISCOVER_LOGO_HREF = APP_ROUTES.DISCOVER.OVERVIEW;
