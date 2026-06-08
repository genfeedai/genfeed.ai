'use client';

import type { IFilterContextValue } from '@genfeedai/interfaces/providers/providers.interface';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { createContext, useContext } from 'react';

export const DEFAULT_FILTERS: IFiltersState = {
  format: '',
  provider: '',
  search: '',
  status: '',
  type: '',
};

export const ElementsFiltersContext = createContext<
  IFilterContextValue | undefined
>(undefined);

export function useElementsFilters(): IFilterContextValue {
  const context = useContext(ElementsFiltersContext);
  if (!context) {
    throw new Error(
      'useElementsFilters must be used within an ElementsFiltersProvider',
    );
  }
  return context;
}
