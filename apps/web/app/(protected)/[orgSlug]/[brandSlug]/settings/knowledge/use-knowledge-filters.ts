'use client';

import type { KnowledgeFilters } from '@props/content/knowledge-library.props';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  KNOWLEDGE_STATUS_FILTERS,
  KNOWLEDGE_TYPE_FILTERS,
} from './knowledge-source-display';

type FilterParam = 'q' | 'space' | 'status' | 'type';

function readAllowed(
  value: string | null,
  allowed: readonly string[],
): string | null {
  return value && allowed.includes(value) ? value : null;
}

/**
 * The Knowledge list filters live in the URL (`?q=&space=&status=&type=`), so a
 * filtered list is linkable and survives a refresh. An unknown status or type
 * in a hand-edited URL reads as no filter.
 */
export function useKnowledgeFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';

  const filters = useMemo<KnowledgeFilters>(() => {
    const params = new URLSearchParams(search);
    return {
      search: params.get('q') ?? '',
      spaceId: params.get('space') || null,
      status: readAllowed(params.get('status'), KNOWLEDGE_STATUS_FILTERS),
      type: readAllowed(params.get('type'), KNOWLEDGE_TYPE_FILTERS),
    };
  }, [search]);

  const update = useCallback(
    (changes: Partial<Record<FilterParam, string | null>>) => {
      const params = new URLSearchParams(search);
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, search],
  );

  return {
    clearFilters: useCallback(
      () => update({ space: null, status: null, type: null }),
      [update],
    ),
    filters,
    hasActiveFilters:
      filters.search.trim() !== '' ||
      filters.spaceId !== null ||
      filters.status !== null ||
      filters.type !== null,
    setSearch: useCallback(
      (value: string) => update({ q: value.trim() || null }),
      [update],
    ),
    setSpace: useCallback(
      (value: string) => update({ space: value === 'all' ? null : value }),
      [update],
    ),
    setStatus: useCallback(
      (value: string) => update({ status: value === 'all' ? null : value }),
      [update],
    ),
    setType: useCallback(
      (value: string) => update({ type: value === 'all' ? null : value }),
      [update],
    ),
  };
}
