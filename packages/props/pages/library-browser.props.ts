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
/**
 * #5502 Recent and Starred are toolbar filters, not navigation. `null` from
 * the show control means every asset.
 */
export type LibraryBrowserPlace = LibraryPlace.RECENT | LibraryPlace.STARRED;
export interface LibraryBrowserProps {
  place?: LibraryPlace;
  shelf?: LibraryShelf;
  /** Type chips pre-selected by a type-seeded route. The operator can clear them. */
  seededCategories?: readonly IngredientCategory[];
  /**
   * Origins a route lists when the URL names none (`/library/imported`). Without
   * it the unfiltered browser lists generated output only.
   */
  seededOrigins?: readonly IngredientOrigin[];
  /** Header copy for a seeded route. Ignored when `shelf` is set. */
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

/** Everything the Filters menu reads and writes. */
export interface LibraryFilterProps {
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
  /** Recent or Starred; Trash replaces them because all three use `place`. */
  onPlaceChange: (place: LibraryBrowserPlace | null) => void;
  /** Selected character ids (`?characters=`). */
  characters: string[];
  /** Characters available to the active brand. Empty hides the filter. */
  characterOptions: LibraryCharacterOption[];
  origins: IngredientOrigin[];
  /** Selected tag ids (`?tags=`). */
  tags: string[];
  /** How the selected tags combine (`?tagMatch=`). */
  tagMatch: TagMatchMode;
  /** Tags the active brand can use, with asset counts. Empty hides the filter. */
  tagOptions: ITag[];
  onCategoriesChange: (categories: IngredientCategory[]) => void;
  onCharactersChange: (characters: string[]) => void;
  onOriginsChange: (origins: IngredientOrigin[]) => void;
  onTagMatchChange: (tagMatch: TagMatchMode) => void;
  onTagsChange: (tags: string[]) => void;
  /** Resets every filter in one URL update; sort and view are kept. */
  onClearAllFilters: () => void;
  /** Admin spans every organization: no shelves, places or per-brand counts. */
  isAdminScope?: boolean;
}

export interface LibraryBrowserToolbarProps {
  isRecoveryView?: boolean;
  viewMode: LibraryViewMode;
  isRefreshing: boolean;
  reviewUnsortedHref?: string;
  onViewModeChange: (viewMode: LibraryViewMode) => void;
  onRefresh: () => void;
  onUpload: () => void;
}

/** The Library search with its Filters menu (filters and sort) attached inside. */
export interface LibraryBrowserSearchProps extends LibraryFiltersMenuProps {
  placeholder: string;
  search: string;
  onSearch: (value: string) => void;
}

export interface LibraryFiltersMenuProps extends LibraryFilterProps {
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
  sort: string;
  sortOptions: LibraryBrowserSortOption[];
  onSortChange: (sort: string) => void;
}

export interface LibraryFilterChoice {
  count?: number;
  isLiteral?: boolean;
  label: string;
  value: string;
}

/** Derived state of the Filters menu. */
export interface LibraryFilterModel {
  originChoices: LibraryFilterChoice[];
  placeValue: string;
  statusChoices: LibraryFilterChoice[];
  statusValue: string;
  tagChoices: LibraryFilterChoice[];
  typeChoices: LibraryFilterChoice[];
  typeValues: string[];
  onOriginValuesChange: (values: string[]) => void;
  onPlaceValueChange: (value: string) => void;
  onStatusValueChange: (value: string) => void;
  onTypeValuesChange: (values: string[]) => void;
}
