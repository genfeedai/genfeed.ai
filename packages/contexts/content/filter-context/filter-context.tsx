'use client';

import type {
  IFilterContextType,
  IFilterProviderProps,
  IFilters,
  IFiltersState,
} from '@cloud/interfaces/utils/filters.interface';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

const FilterContext = createContext<IFilterContextType | undefined>(undefined);
export function FilterProvider({ children, value }: IFilterProviderProps) {
  const [filters, setFilters] = useState<IFiltersState>({
    format: '',
    provider: '',
    search: '',
    status: '',
    type: '',
  });

  const [query, setQuery] = useState<IFilters>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshCallbackRef = useRef<(() => void) | null>(null);

  const handleRefresh = useCallback((callback: () => void) => {
    refreshCallbackRef.current = callback;
  }, []);

  const contextValue = useMemo<IFilterContextType>(
    () =>
      value || {
        filters,
        isRefreshing,
        onRefresh: handleRefresh,
        query,
        setFilters,
        setIsRefreshing,
        setQuery,
      },
    [value, filters, isRefreshing, handleRefresh, query],
  );

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilterContext() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilterContext must be used within FilterProvider');
  }
  return context;
}
