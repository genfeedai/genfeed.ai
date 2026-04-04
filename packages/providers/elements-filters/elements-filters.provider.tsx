'use client';

import type { IFilterContextValue } from '@cloud/interfaces/providers/providers.interface';
import type {
  IFilters,
  IFiltersState,
} from '@cloud/interfaces/utils/filters.interface';
import type { LayoutProps } from '@props/layout/layout.props';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

const DEFAULT_FILTERS: IFiltersState = {
  format: '',
  provider: '',
  search: '',
  status: '',
  type: '',
};

export const ElementsFiltersContext = createContext<
  IFilterContextValue | undefined
>(undefined);

export function ElementsFiltersProvider({ children }: LayoutProps): ReactNode {
  const [filters, setFilters] = useState<IFiltersState>(DEFAULT_FILTERS);
  const [query, setQuery] = useState<IFilters>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const value = useMemo<IFilterContextValue>(
    () => ({
      filters,
      isRefreshing,
      query,
      setFilters,
      setIsRefreshing,
      setQuery,
    }),
    [filters, query, isRefreshing],
  );

  return (
    <ElementsFiltersContext.Provider value={value}>
      {children}
    </ElementsFiltersContext.Provider>
  );
}

export function useElementsFilters(): IFilterContextValue {
  const context = useContext(ElementsFiltersContext);
  if (!context) {
    throw new Error(
      'useElementsFilters must be used within an ElementsFiltersProvider',
    );
  }
  return context;
}
