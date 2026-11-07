'use client';

import { ViewType } from '@genfeedai/contracts';
import { useCallback, useMemo, useState } from 'react';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import { filterStudioPlaygroundJobs } from '@/features/studio/playground/utils/studio-playground-asset';
import type { StudioPlaygroundFilter } from '@/features/studio/props/studio-playground.props';

export type StudioResultsSort = 'newest' | 'oldest';
export type StudioResultsView = ViewType.GRID | ViewType.LIST;

export interface UseStudioResultsFiltersReturn {
  clearFilters: () => void;
  resultSort: StudioResultsSort;
  resultType: StudioPlaygroundFilter;
  resultsView: StudioResultsView;
  search: string;
  setResultSort: (sort: StudioResultsSort) => void;
  setResultType: (type: StudioPlaygroundFilter) => void;
  setResultsView: (view: StudioResultsView) => void;
  setSearch: (search: string) => void;
  visibleJobs: StudioPlaygroundJob[];
}

/**
 * The Studio results toolbar: search text, type filter, sort order and grid
 * or list view, plus the gallery jobs those filters leave visible. Clearing
 * resets the type and sort and keeps the search text, like the toolbar's
 * clear button always has.
 */
export function useStudioResultsFilters(
  galleryJobs: readonly StudioPlaygroundJob[],
): UseStudioResultsFiltersReturn {
  const [search, setSearch] = useState('');
  const [resultType, setResultType] = useState<StudioPlaygroundFilter>('all');
  const [resultSort, setResultSort] = useState<StudioResultsSort>('newest');
  const [resultsView, setResultsView] = useState<StudioResultsView>(
    ViewType.GRID,
  );

  const visibleJobs = useMemo(() => {
    const filtered = filterStudioPlaygroundJobs(galleryJobs, {
      search,
      type: resultType,
    });
    return resultSort === 'oldest' ? [...filtered].reverse() : filtered;
  }, [galleryJobs, resultSort, resultType, search]);

  const clearFilters = useCallback(() => {
    setResultType('all');
    setResultSort('newest');
  }, []);

  return {
    clearFilters,
    resultSort,
    resultType,
    resultsView,
    search,
    setResultSort,
    setResultType,
    setResultsView,
    setSearch,
    visibleJobs,
  };
}
