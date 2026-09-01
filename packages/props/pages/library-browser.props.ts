import type { LibraryViewMode } from '@genfeedai/constants';
import type {
  IngredientCategory,
  LibraryPlace,
  LibraryShelf,
  PageScope,
} from '@genfeedai/enums';
import type { ReactNode } from 'react';

/**
 * One browser, every Library destination.
 *
 * The three axes never collapse into one another: `place` and `shelf` come from
 * the route, `seededCategories` seeds the type axis for the legacy per-type deep
 * links (`/library/videos`), and the folder axis arrives as `?folder=`. A caller
 * sets at most one of `place` / `shelf`.
 */
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

export interface LibraryBrowserToolbarProps {
  categories: IngredientCategory[];
  search: string;
  searchPlaceholder?: string;
  sort: string;
  sortOptions: LibraryBrowserSortOption[];
  viewMode: LibraryViewMode;
  isRefreshing: boolean;
  onCategoriesChange: (categories: IngredientCategory[]) => void;
  onClearCategories: () => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: string) => void;
  onViewModeChange: (viewMode: LibraryViewMode) => void;
  onRefresh: () => void;
  onUpload: () => void;
}
