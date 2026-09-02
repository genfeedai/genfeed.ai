import { APP_ROUTES, createLibraryShelfRoute } from '@genfeedai/constants';
import { LIBRARY_SHELF_LABELS, LibraryShelf } from '@genfeedai/enums';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Archive,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Images,
  Inbox,
  LoaderCircle,
  Star,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

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
 * Places — views over the same rows that are *not* generation state.
 * All assets is the unfiltered browser; the rest are ownership
 * (`isFavorite`) and lifecycle (`isDeleted`) cuts.
 */
export const LIBRARY_PLACE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.LIBRARY.ASSETS,
    label: 'All assets',
    // Type routes are the same browser with a chip pre-selected, so they light
    // up All assets rather than a nav row of their own.
    matchPaths: [...LIBRARY_ASSET_ROUTES],
    outline: Images,
    solid: Images,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.RECENT,
    isExactMatch: true,
    label: 'Recent',
    matchPaths: [APP_ROUTES.LIBRARY.RECENT],
    outline: Clock,
    solid: Clock,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.STARRED,
    isExactMatch: true,
    label: 'Starred',
    matchPaths: [APP_ROUTES.LIBRARY.STARRED],
    outline: Star,
    solid: Star,
  },
];

const SHELF_ICONS = {
  [LibraryShelf.GENERATING]: LoaderCircle,
  [LibraryShelf.UNSORTED]: Inbox,
  [LibraryShelf.NEEDS_REVIEW]: ClipboardCheck,
  [LibraryShelf.APPROVED]: CircleCheck,
  [LibraryShelf.FAILED]: TriangleAlert,
  [LibraryShelf.ARCHIVED]: Archive,
} as const;

/**
 * Shelves — the generation-state axis, in lifecycle order.
 *
 * A shelf is a saved query, not a location: an asset lands on one by
 * generating, failing, or being reviewed, with nobody moving it. Shelf
 * membership overlaps and never partitions the library total.
 */
export const LIBRARY_SHELF_MENU_ITEMS: MenuItemConfig[] = [
  LibraryShelf.GENERATING,
  LibraryShelf.UNSORTED,
  LibraryShelf.NEEDS_REVIEW,
  LibraryShelf.APPROVED,
  LibraryShelf.FAILED,
  LibraryShelf.ARCHIVED,
].map((shelf) => ({
  group: 'Shelves',
  href: createLibraryShelfRoute(shelf),
  isExactMatch: true,
  label: LIBRARY_SHELF_LABELS[shelf],
  matchPaths: [createLibraryShelfRoute(shelf)],
  outline: SHELF_ICONS[shelf],
  solid: SHELF_ICONS[shelf],
}));

/**
 * Destinations that are neither a place over the asset table nor a shelf.
 * Trash sits here because it is the end of the lifecycle, not a state you
 * generate into.
 */
export const LIBRARY_TAIL_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: 'Library',
    href: APP_ROUTES.LIBRARY.TRASH,
    isExactMatch: true,
    label: 'Trash',
    matchPaths: [APP_ROUTES.LIBRARY.TRASH],
    outline: Trash2,
    solid: Trash2,
  },
];

/**
 * Library navigation, flattened for the shell.
 *
 * Folders are the third axis and are *not* here — they are org data, so the
 * sidebar loads them as a live tree between the shelves and the tail.
 */
export const LIBRARY_MENU_ITEMS: MenuItemConfig[] = [
  ...LIBRARY_PLACE_MENU_ITEMS,
  ...LIBRARY_SHELF_MENU_ITEMS,
  ...LIBRARY_TAIL_MENU_ITEMS,
];
