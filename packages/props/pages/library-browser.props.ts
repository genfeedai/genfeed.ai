import type {
  IngredientCategory,
  IngredientOrigin,
  LibraryPlace,
  LibraryShelf,
  PageScope,
  TagMatchMode,
} from '@genfeedai/contracts';
import type { LibraryViewMode } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

/**
 * One browser, every Library destination.
 *
 * The three axes never collapse into one another: `place` and `shelf` come from
 * the URL, `seededCategories` seeds the type axis for the legacy per-type deep
 * links (`/library/videos`), and the folder axis arrives as `?folder=`. Shelf
 * and Trash are the toolbar status filter. A caller sets at most one of
 * `place` / `shelf` as the default when the URL omits them.
 */

/** A library shelf, or Trash. `null` from the status control means All. */
export type LibraryBrowserStatus = LibraryShelf | 'trash';
export interface LibraryBrowserProps {
  place?: LibraryPlace;
  shelf?: LibraryShelf;
  /** Type chips pre-selected by a type-seeded route. The operator can clear them. */
  seededCategories?: readonly IngredientCategory[];
  /** Header copy for a type-seeded route. Ignored when `shelf` is set. */
  preset?: LibraryBrowserPreset;
  scope?: PageScope.BRAND | PageScope.ORGANIZATION | PageScope.SUPERADMIN;
  children?: ReactNode;
}

/**
 * Header copy for a type-seeded preset route (`/library/videos`). A preset is
 * still the one browser — the copy just names the preset instead of claiming
 * the operator is looking at everything.
 */
export interface LibraryBrowserPreset {
  label: string;
  description: string;
}

export interface LibraryBrowserSortOption {
  label: string;
  value: string;
}

/** A character the Library can be filtered by. */
export interface LibraryCharacterOption {
  /** Avatar ingredient id, when the character has one. */
  avatarIngredientId?: string | null;
  id: string;
  label: string;
}

export interface LibraryBrowserToolbarProps {
  isRecoveryView?: boolean;
  categories: IngredientCategory[];
  /** Current place from the URL. Trash selects the Trash status option. */
  place?: LibraryPlace;
  /** Current shelf from the URL. Omitted means All, unless `place` is Trash. */
  shelf?: LibraryShelf;
  /** Per-shelf counts for the status options. */
  shelfCounts?: Partial<Record<LibraryShelf, number>>;
  /** Soft-deleted assets still listed under Trash. */
  trashedCount?: number;
  onStatusChange: (status: LibraryBrowserStatus | null) => void;
  /** Selected character ids (`?characters=`). */
  characters: string[];
  /** Characters available to the active brand. Empty hides the filter. */
  characterOptions: LibraryCharacterOption[];
  origins: IngredientOrigin[];
  sort: string;
  /** Selected tag ids (`?tags=`). */
  tags: string[];
  /** How the selected tags combine (`?tagMatch=`). */
  tagMatch: TagMatchMode;
  /** Tags the active brand can use, with asset counts. Empty hides the filter. */
  tagOptions: ITag[];
  sortOptions: LibraryBrowserSortOption[];
  viewMode: LibraryViewMode;
  isRefreshing: boolean;
  reviewUnsortedHref?: string;
  onCategoriesChange: (categories: IngredientCategory[]) => void;
  onCharactersChange: (characters: string[]) => void;
  onClearCategories: () => void;
  onClearCharacters: () => void;
  onOriginsChange: (origins: IngredientOrigin[]) => void;
  onClearOrigins: () => void;
  onClearTags: () => void;
  onTagMatchChange: (tagMatch: TagMatchMode) => void;
  onTagsChange: (tags: string[]) => void;
  onSortChange: (sort: string) => void;
  onViewModeChange: (viewMode: LibraryViewMode) => void;
  onRefresh: () => void;
  onUpload: () => void;
}
