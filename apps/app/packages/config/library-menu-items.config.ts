import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Clock, Images, ScanFace, Star } from 'lucide-react';

/**
 * Type-seeded entry points into the same asset browser.
 *
 * They stay as shareable deep links (`LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY`
 * resolves into them) but they are *not* navigation — asset type is a filter
 * chip on the browser toolbar, so the sidebar never lists them.
 *
 * @see .agents/memory/feedback_library_information_architecture.md
 */
export const LIBRARY_ASSET_ROUTES = [
  APP_ROUTES.LIBRARY.ASSETS,
  APP_ROUTES.LIBRARY.VIDEOS,
  APP_ROUTES.LIBRARY.IMAGES,
  APP_ROUTES.LIBRARY.GIFS,
  APP_ROUTES.LIBRARY.AVATARS,
  APP_ROUTES.LIBRARY.VOICES,
  APP_ROUTES.LIBRARY.MUSIC,
  APP_ROUTES.LIBRARY.CAPTIONS,
] as const;

/**
 * Library destinations.
 *
 * All assets, Recent, and Starred are views over the asset browser. Characters
 * is its own page. Generation state and Trash are a status filter on the
 * browser, not rows in this list.
 */
export const LIBRARY_PLACE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.LIBRARY.ASSETS,
    label: 'All assets',
    // Type routes are the same browser with a chip pre-selected, so they light
    // up All assets rather than a nav row of their own.
    matchPaths: [...LIBRARY_ASSET_ROUTES],
    matchSearchParams: { place: null },
    outline: Images,
    solid: Images,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.RECENT,
    isExactMatch: true,
    label: 'Recent',
    matchPaths: [APP_ROUTES.LIBRARY.ASSETS],
    matchSearchParams: { place: 'recent' },
    outline: Clock,
    solid: Clock,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.STARRED,
    isExactMatch: true,
    label: 'Starred',
    matchPaths: [APP_ROUTES.LIBRARY.ASSETS],
    matchSearchParams: { place: 'starred' },
    outline: Star,
    solid: Star,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.CHARACTERS,
    label: 'Characters',
    outline: ScanFace,
    solid: ScanFace,
  },
];

/**
 * Library navigation, flattened for the shell.
 *
 * Folders stay a live tree under these links. Shelves and Trash are the
 * browser's status filter, so they are not navigation.
 */
export const LIBRARY_MENU_ITEMS: MenuItemConfig[] = [
  ...LIBRARY_PLACE_MENU_ITEMS,
];
