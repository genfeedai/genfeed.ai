import type { IFilters, IFiltersState } from '../utils/filters.interface';

export interface IModelsContextType {
  refreshModels: (() => void) | null;
  isRefreshing: boolean;
  setRefreshModels: (fn: (() => Promise<void>) | null) => void;
  filters: IFiltersState;
  setFilters: (filters: IFiltersState) => void;
  setQuery: (query: IFilters) => void;
}
