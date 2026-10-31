'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * The admin list search, stored in the URL as `q`. Every admin list reads the
 * same param, so a search is linkable and survives a refresh. Searching
 * returns to the first page.
 */
export function useAdminSearchParam(): {
  search: string;
  setSearch: (value: string) => void;
} {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';

  const search = useMemo(
    () => new URLSearchParams(searchParamsString).get('q') ?? '',
    [searchParamsString],
  );

  const setSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParamsString);
      const term = value.trim();
      if (term) params.set('q', term);
      else params.delete('q');
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  return { search, setSearch };
}
