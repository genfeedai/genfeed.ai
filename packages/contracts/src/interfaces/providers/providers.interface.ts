import type { ReactNode } from 'react';
import type { LibraryViewMode } from '../../constants';
import type { IFilters, IFiltersState } from '../utils/filters.interface';

interface LayoutProps {
  children?: ReactNode;
}

export interface IProviderWithValue<T> extends LayoutProps {
  value: T;
}

export interface IIngredientsContextValue extends IFilterContextValue {
  ingredientType: string;
  setIngredientType: (type: string) => void;
  /** Present for the unified Library browser; legacy ingredient pages omit it. */
  viewMode?: LibraryViewMode;
  /**
   * Plural label for the type chips currently applied in the Library browser
   * ("Images", "Videos"), so an empty list can name what is empty. Undefined
   * when no chip or more than one type is active — the list is "assets" then.
   * Present for the unified Library browser; legacy ingredient pages omit it.
   */
  activeTypeLabel?: string;
}

export interface IFilterContextValue {
  filters: IFiltersState;
  query: IFilters;
  isRefreshing: boolean;

  setFilters: (filters: IFiltersState) => void;
  setQuery: (query: IFilters) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
  onRefresh?: (callback: () => void) => void;
}
