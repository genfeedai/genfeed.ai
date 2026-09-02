import {
  IngredientCategory,
  LibraryPlace,
  LibraryShelf,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
  description: string;
  categories: readonly IngredientCategory[];
}

/**
 * The type-seeded preset routes.
 *
 * The per-type routes survive as deep links (the agent, workspace cards, brand
 * settings and the e2e suite all point at them), but they are presets over the
 * one browser rather than separate surfaces — the operator can widen or clear
 * the chips without leaving the page, and the shelf and folder axes stay live
 * underneath.
 */
export const LIBRARY_TYPE_PRESETS: Readonly<Record<string, LibraryTypePreset>> =
  {
    [APP_ROUTES.LIBRARY.AVATARS]: {
      categories: [IngredientCategory.AVATAR],
      description:
        'Avatars this brand generated. Clear the chip to see the rest.',
      label: 'Avatars',
    },
    [APP_ROUTES.LIBRARY.GIFS]: {
      categories: [IngredientCategory.GIF],
      description: 'GIFs this brand generated. Clear the chip to see the rest.',
      label: 'GIFs',
    },
    [APP_ROUTES.LIBRARY.IMAGES]: {
      categories: [IngredientCategory.IMAGE, IngredientCategory.IMAGE_EDIT],
      description:
        'Images and edits this brand generated. Clear the chip to see the rest.',
      label: 'Images',
    },
    [APP_ROUTES.LIBRARY.MUSIC]: {
      categories: [IngredientCategory.MUSIC, IngredientCategory.AUDIO],
      description: 'Music and audio beds. Clear the chip to see the rest.',
      label: 'Music',
    },
    [APP_ROUTES.LIBRARY.VIDEOS]: {
      categories: [IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT],
      description:
        'Videos and edits this brand generated. Clear the chip to see the rest.',
      label: 'Videos',
    },
  };

export interface LibraryDestinationCopy {
  label: string;
  description: string;
}

export const LIBRARY_PLACE_COPY: Readonly<
  Record<LibraryPlace, LibraryDestinationCopy>
> = {
  [LibraryPlace.ASSETS]: {
    description: 'Everything this brand has generated, in one place.',
    label: 'All assets',
  },
  [LibraryPlace.RECENT]: {
    description: 'What you and your agents touched most recently.',
    label: 'Recent',
  },
  [LibraryPlace.STARRED]: {
    description: 'The assets you marked worth coming back to.',
    label: 'Starred',
  },
  [LibraryPlace.TRASH]: {
    description: 'Deleted assets, still recoverable.',
    label: 'Trash',
  },
};

/**
 * Shelf descriptions. Labels stay in `LIBRARY_SHELF_LABELS` so the sidebar and
 * the browser header can never drift apart.
 */
export const LIBRARY_SHELF_DESCRIPTIONS: Readonly<
  Record<LibraryShelf, string>
> = {
  [LibraryShelf.APPROVED]: 'Signed off and safe to publish.',
  [LibraryShelf.ARCHIVED]: 'Retired or rejected — out of the way, not gone.',
  [LibraryShelf.FAILED]: 'Generations that did not finish. Retry or discard.',
  [LibraryShelf.GENERATING]: 'Still rendering. This shelf empties itself.',
  [LibraryShelf.NEEDS_REVIEW]:
    'Waiting on a human decision before it can ship.',
  [LibraryShelf.UNSORTED]:
    'Finished assets nobody has filed into a folder yet.',
};

/** `sort` is the API's `field: direction` string, not a UI-only token. */
export const LIBRARY_SORT_OPTIONS: readonly LibraryBrowserSortOption[] = [
  { label: 'Newest first', value: 'createdAt: -1' },
  { label: 'Oldest first', value: 'createdAt: 1' },
  { label: 'Recently updated', value: 'updatedAt: -1' },
  { label: 'Name A–Z', value: 'label: 1' },
] as const;

export const LIBRARY_RECENT_SORT = 'updatedAt: -1';
