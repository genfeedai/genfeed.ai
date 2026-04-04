'use client';

import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import type {
  UseFiltersParams,
  UseFiltersReturn,
} from '@pages/studio/generate/types';
import {
  DEFAULT_INGREDIENT_STATUSES,
  isImageOrVideoCategory,
} from '@pages/studio/generate/utils/helpers';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useFilters({
  categoryType,
  initialFormat,
  setCurrentPage,
  setLoadedPages,
  setAllAssets,
}: UseFiltersParams): UseFiltersReturn {
  const [filters, setFilters] = useState<IFiltersState>({
    format: initialFormat,
    provider: '',
    search: '',
    sort: 'createdAt: -1',
    status: DEFAULT_INGREDIENT_STATUSES,
    type: '',
  });

  const filtersRef = useRef(filters);

  // Update filters ref when filters change
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Keep the filter format aligned with explicit route/query state, not the composer.
  useEffect(() => {
    const nextFormat = isImageOrVideoCategory(categoryType)
      ? initialFormat
      : '';

    if (filtersRef.current.format === nextFormat) {
      return;
    }

    setFilters((prev) => ({ ...prev, format: nextFormat }));
  }, [categoryType, initialFormat]);

  const handleFiltersChange = useCallback(
    (newFilters: IFiltersState) => {
      const statusFilter =
        Array.isArray(newFilters.status) && newFilters.status.length === 0
          ? DEFAULT_INGREDIENT_STATUSES
          : newFilters.status;

      setFilters({ ...newFilters, status: statusFilter });

      setCurrentPage(1);
      setLoadedPages([]);
      setAllAssets([]);
    },
    [setCurrentPage, setLoadedPages, setAllAssets],
  );

  return {
    filters,
    filtersRef,
    handleFiltersChange,
    setFilters,
  };
}
