import type { ReactNode } from 'react';

export interface FilterMenuOption {
  /** Wire value reported back to the owner; never shown. */
  value: string;
  label: string;
  icon?: ReactNode;
  /** Number of results behind the option, shown as a right-aligned badge. */
  count?: number;
  /** Text the user typed (tags, names): shown exactly as written, never re-cased. */
  isLiteral?: boolean;
}

interface FilterMenuFacetBase {
  key: string;
  label: string;
  options: readonly FilterMenuOption[];
  /** Shown instead of the list when `options` is empty. */
  emptyLabel?: string;
  /** Adds a search box to the submenu once the list is long enough to need one. */
  searchPlaceholder?: string;
}

/** Any number of values; none selected means "all". */
export interface FilterMenuMultipleFacet extends FilterMenuFacetBase {
  selection: 'multiple';
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** Once this many are selected the remaining options are disabled. */
  maxSelected?: number;
  /** Explains why options are disabled at `maxSelected`. */
  maxSelectedMessage?: string;
}

/** Exactly one value; `defaultValue` is the "no filter" choice. */
export interface FilterMenuSingleFacet extends FilterMenuFacetBase {
  selection: 'single';
  value: string;
  defaultValue?: string;
  /**
   * False for facets that order or combine results (sort, match any/all)
   * rather than narrow them, so they never light up the active-filter badge.
   */
  isCounted?: boolean;
  onChange: (value: string) => void;
}

export type FilterMenuFacet = FilterMenuMultipleFacet | FilterMenuSingleFacet;

export interface FilterMenuProps {
  facets: readonly FilterMenuFacet[];
  /** Trigger text. Defaults to the shared "Filters". */
  label?: string;
  /** Screen-reader text for the badge. Defaults to the shared "N active filters". */
  getActiveCountLabel?: (count: number) => string;
  /** Defaults to the shared "Clear filters". */
  clearLabel?: string;
  onClear: () => void;
  /** Shown beside a facet that has nothing selected. Defaults to "All". */
  allLabel?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
}
