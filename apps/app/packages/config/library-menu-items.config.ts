import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { AtSign, Download, Gauge, LibraryBig } from 'lucide-react';

/**
 * Type routes over the same asset browser.
 *
 * They are shareable deep links (`LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY`
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
 * Library destinations (#5502): Overview, Assets, Imported and References.
 *
 * Recent, Starred, generation state and Trash are views picked from the asset
 * browser toolbar (`/library/recent`, `/library/shelf/approved`, ...), so every
 * one of them lights up Assets, which lists generated output only. Imported
 * lists what was uploaded or imported. References are the reusable identities
 * (characters today) that generations reference by name.
 */
export const LIBRARY_PLACE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.LIBRARY.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.LIBRARY.OVERVIEW, APP_ROUTES.LIBRARY.ROOT],
    outline: Gauge,
    solid: Gauge,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.ASSETS,
    label: 'Assets',
    // Type, place and shelf routes are the same browser, so they light up
    // Assets rather than a nav row of their own.
    matchPaths: [
      ...LIBRARY_ASSET_ROUTES,
      APP_ROUTES.LIBRARY.RECENT,
      APP_ROUTES.LIBRARY.STARRED,
      APP_ROUTES.LIBRARY.TRASH,
      APP_ROUTES.LIBRARY.SHELF,
    ],
    outline: LibraryBig,
    solid: LibraryBig,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.IMPORTED,
    label: 'Imported',
    outline: Download,
    solid: Download,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.REFERENCES,
    label: 'References',
    outline: AtSign,
    solid: AtSign,
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
