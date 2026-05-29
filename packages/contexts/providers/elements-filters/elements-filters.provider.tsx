'use client';

import type { IFilterContextValue } from '@genfeedai/interfaces/providers/providers.interface';
import type { IFilters } from '@genfeedai/interfaces/utils/filters.interface';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  DEFAULT_FILTERS,
  ElementsFiltersContext,
} from './elements-filters.context';

export function ElementsFiltersProvider({ children }: LayoutProps): ReactNode {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
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
