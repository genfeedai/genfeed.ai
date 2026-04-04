import type { ReactNode } from 'react';
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
