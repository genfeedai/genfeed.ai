import type { ReactNode } from 'react';

export type FilterValue = string | string[] | number | undefined;

export interface IFilters extends Record<string, FilterValue> {
  search?: string;
  status?: string | string[];
  format?: string;
  type?: string;
  provider?: string;
  model?: string;
  sort?: string;
  favorite?: string;
  brand?: string;
  folder?: string;
}

export interface IFiltersState {
  search: string;
  status: string | string[];
  format: string;
  type: string;
  provider: string;
  model?: string;
  sort?: string;
  favorite?: string;
  brand?: string;
  folder?: string;
  category?: string;
}

export interface IFilterContextType {
  filters: IFiltersState;
  query: IFilters;
  isRefreshing: boolean;
  setFilters: (filters: IFiltersState) => void;
  setQuery: (query: IFilters) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
  onRefresh?: (callback: () => void) => void;
}

export interface IFilterProviderProps {
  children: ReactNode;
  value?: IFilterContextType;
}
