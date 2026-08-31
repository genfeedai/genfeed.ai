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
 * Discovery sidebar: module peers + platform feeds as real menu items.
 *
 * Platform destinations used to live only as topbar pills under Socials.
 * Feeds are destinations — they belong in the section menu next to Overview /
 * Following / Ads, not as rounded filter chips.
 *
 * `/discovery/socials` is retired (same TrendsList as Overview) and redirects
 * to `/discovery/overview` — do not re-add a Socials peer here.
 */
export const DISCOVERY_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.DISCOVERY.OVERVIEW,
    label: 'Overview',
    matchPaths: [
      APP_ROUTES.DISCOVERY.ROOT,
      APP_ROUTES.DISCOVERY.OVERVIEW,
      APP_ROUTES.DISCOVERY.DISCOVERY,
      APP_ROUTES.DISCOVERY.SOCIALS,
    ],
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
    href: APP_ROUTES.DISCOVERY.ADS,
    label: 'Ads',
    matchPaths: [
      APP_ROUTES.DISCOVERY.ADS,
      APP_ROUTES.DISCOVERY.ADS_GOOGLE,
      APP_ROUTES.DISCOVERY.ADS_META,
      APP_ROUTES.DISCOVERY.ADS_TIKTOK,
      APP_ROUTES.DISCOVERY.ADS_X,
    ],
    outline: Megaphone,
    solid: Megaphone,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_TWITTER,
    isCollapsible: true,
    label: 'X',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_TWITTER],
    outline: XTwitterIcon,
    solid: XTwitterIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_INSTAGRAM,
    label: 'Instagram',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_INSTAGRAM],
    outline: InstagramIcon,
    solid: InstagramIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_YOUTUBE,
    label: 'YouTube',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_YOUTUBE],
    outline: YoutubeIcon,
    solid: YoutubeIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_TIKTOK,
    label: 'TikTok',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_TIKTOK],
    outline: TiktokIcon,
    solid: TiktokIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_LINKEDIN,
    label: 'LinkedIn',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_LINKEDIN],
    outline: LinkedinIcon,
    solid: LinkedinIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_REDDIT,
    label: 'Reddit',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_REDDIT],
    outline: RedditIcon,
    solid: RedditIcon,
  },
  {
    group: 'Platforms',
    href: APP_ROUTES.DISCOVERY.PLATFORM_PINTEREST,
    label: 'Pinterest',
    matchPaths: [APP_ROUTES.DISCOVERY.PLATFORM_PINTEREST],
    outline: PinterestIcon,
    solid: PinterestIcon,
  },
];
