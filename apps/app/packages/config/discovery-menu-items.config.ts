import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { AtSign, Megaphone, TrendingUp } from 'lucide-react';

/**
 * Discovery sidebar: Overview, Following, Ads.
 *
 * Following is not its own route — it's the same Overview surface filtered
 * to followed sources via `?source=following`. Overview itself is only
 * "active" when that query param is absent, so the two items never both
 * highlight for the same page.
 *
 * Per-platform feeds (`/discovery/instagram`, etc.) and the deprecated
 * `/discovery/discovery` and `/discovery/socials` redirects are retired —
 * do not re-add platform peers or a Socials item here.
 */
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
    href: `${APP_ROUTES.DISCOVERY.OVERVIEW}?source=following`,
    label: 'Following',
    matchPaths: [APP_ROUTES.DISCOVERY.OVERVIEW],
    matchSearchParams: { source: 'following' },
    outline: AtSign,
    solid: AtSign,
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
