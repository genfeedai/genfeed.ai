'use client';

import type { IModelsContextType } from '@genfeedai/interfaces/models/models-context.interface';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

const ModelsContext = createContext<IModelsContextType>({
  filters: {
    category: '',
    format: '',
    provider: '',
    search: '',
    status: '',
    type: '',
  },
  isRefreshing: false,
  refreshModels: null,
  setFilters: () => {},
  setQuery: () => {},
  setRefreshModels: () => {},
});

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRefreshFn, setHasRefreshFn] = useState(false);
  const rawRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const [filters, setFilters] = useState<IFiltersState>({
    category: '',
    format: '',
    provider: '',
    search: '',
    status: '',
    type: '',
  });
  const [, setQuery] = useState<IFilters>({});

  const refreshModels = useCallback(() => {
    if (!rawRefreshRef.current) {
      return;
    }
    setIsRefreshing(true);
    rawRefreshRef.current().finally(() => setIsRefreshing(false));
  }, []);

  const setRefreshModels = useCallback((fn: (() => Promise<void>) | null) => {
    rawRefreshRef.current = fn;
    setHasRefreshFn(!!fn);
  }, []);

  const contextValue = useMemo<IModelsContextType>(
    () => ({
      filters,
      isRefreshing,
      refreshModels: hasRefreshFn ? refreshModels : null,
      setFilters,
      setQuery,
      setRefreshModels,
    }),
    [hasRefreshFn, refreshModels, isRefreshing, setRefreshModels, filters],
  );

  return (
    <ModelsContext.Provider value={contextValue}>
      {children}
    </ModelsContext.Provider>
  );
}

export function useModelsContext() {
  return useContext(ModelsContext);
}
