import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Images, ScanFace } from 'lucide-react';

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
 * Library destinations (#5502): Assets and References.
 *
 * Recent, Starred, generation state and Trash are filters on the asset
 * browser toolbar, so every `?place=` and `?shelf=` view lights up Assets.
 * References are the reusable identities (characters today) that generations
 * reference by name.
 */
export const LIBRARY_PLACE_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.LIBRARY.ASSETS,
    label: 'Assets',
    // Type routes are the same browser with a chip pre-selected, so they light
    // up Assets rather than a nav row of their own.
    matchPaths: [...LIBRARY_ASSET_ROUTES],
    outline: Images,
    solid: Images,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.REFERENCES,
    label: 'References',
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
