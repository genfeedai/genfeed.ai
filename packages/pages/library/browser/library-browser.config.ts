import { type IngredientCategory, LibraryPlace } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  LIBRARY_TYPE_PRESET_CATEGORIES,
} from '@genfeedai/contracts/constants';
import type { LibraryBrowserSortOption } from '@props/pages/library-browser.props';
import {
  LIBRARY_ASSET_TYPES,
  type LibraryAssetType,
} from '@utils/media/library-asset-type.util';

/**
 * The type axis. One option covers every category that reads as the same
 * *thing* to an operator. Labels are singular so the dropdown and the table
 * pill stay in lockstep.
 */
export type LibraryTypeChip = LibraryAssetType;
export const LIBRARY_TYPE_CHIPS: readonly LibraryTypeChip[] =
  LIBRARY_ASSET_TYPES;

export interface LibraryTypePreset {
  label: string;
  categories: readonly IngredientCategory[];
}

/**
 * The type-seeded preset routes.
 *
 * The per-type routes are deep links (the agent, workspace cards, brand
 * settings and the e2e suite all point at them) over the one browser. Widening
 * or clearing the chips moves to the route that matches the new selection (All
 * assets when none does), and the folder axis stays live underneath.
 */
export const LIBRARY_TYPE_PRESETS: Readonly<Record<string, LibraryTypePreset>> =
  {
    [APP_ROUTES.LIBRARY.AVATARS]: {
      categories:
        LIBRARY_TYPE_PRESET_CATEGORIES[APP_ROUTES.LIBRARY.AVATARS] ?? [],
      label: 'Avatars',
    },
    [APP_ROUTES.LIBRARY.GIFS]: {
      categories: LIBRARY_TYPE_PRESET_CATEGORIES[APP_ROUTES.LIBRARY.GIFS] ?? [],
      label: 'GIFs',
    },
    [APP_ROUTES.LIBRARY.IMAGES]: {
      categories:
        LIBRARY_TYPE_PRESET_CATEGORIES[APP_ROUTES.LIBRARY.IMAGES] ?? [],
      label: 'Images',
    },
    [APP_ROUTES.LIBRARY.MUSIC]: {
      categories:
        LIBRARY_TYPE_PRESET_CATEGORIES[APP_ROUTES.LIBRARY.MUSIC] ?? [],
      label: 'Music',
    },
    [APP_ROUTES.LIBRARY.VIDEOS]: {
      categories:
        LIBRARY_TYPE_PRESET_CATEGORIES[APP_ROUTES.LIBRARY.VIDEOS] ?? [],
      label: 'Videos',
    },
  };

export interface LibraryDestinationCopy {
  label: string;
}

export const LIBRARY_PLACE_COPY: Readonly<
  Record<LibraryPlace, LibraryDestinationCopy>
> = {
  [LibraryPlace.ASSETS]: {
    label: 'All assets',
  },
  [LibraryPlace.RECENT]: {
    label: 'Recent',
  },
  [LibraryPlace.STARRED]: {
    label: 'Starred',
  },
  [LibraryPlace.TRASH]: {
    label: 'Trash',
  },
};

/** `sort` is the API's `field: direction` string, not a UI-only token. */
export const LIBRARY_SORT_OPTIONS: readonly LibraryBrowserSortOption[] = [
  { label: 'Newest first', value: 'createdAt: -1' },
  { label: 'Oldest first', value: 'createdAt: 1' },
  { label: 'Recently updated', value: 'updatedAt: -1' },
  { label: 'Name A–Z', value: 'label: 1' },
] as const;

export const LIBRARY_RECENT_SORT = 'updatedAt: -1';
