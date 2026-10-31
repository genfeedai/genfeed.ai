'use client';

import type { TableSortDirection } from '@genfeedai/props/ui/display/table.props';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

interface UseTableSortOptions {
  /** Keys the list endpoint can order by. Anything else in the URL is ignored. */
  allowedKeys: readonly string[];
}

interface UseTableSortResult {
  sortKey: string | undefined;
  sortDirection: TableSortDirection;
  /** `field: 1` / `field: -1` for the list endpoint's `sort` param; `undefined` keeps the server default. */
  sort: string | undefined;
  onSortChange: (key: string, direction: TableSortDirection) => void;
}

/**
 * The sort of a list whose rows come from a paginated API, stored in the URL
 * as `sort` (`name` ascending, `-name` descending) so it is linkable and
 * survives a refresh. Changing the sort returns to the first page. Pass
 * `sortKey`, `sortDirection` and `onSortChange` to the shared Table and mark
 * the sortable columns with `sortable: true`.
 */
export function useTableSort({
  allowedKeys,
}: UseTableSortOptions): UseTableSortResult {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const allowedKeysId = allowedKeys.join('\u0000');

  const { sortKey, sortDirection } = useMemo(() => {
    const raw = new URLSearchParams(searchParamsString).get('sort') ?? '';
    const direction: TableSortDirection = raw.startsWith('-') ? 'desc' : 'asc';
    const key = raw.replace(/^-/, '');
    return {
      sortDirection: direction,
      sortKey: allowedKeysId.split('\u0000').includes(key) ? key : undefined,
    };
  }, [allowedKeysId, searchParamsString]);

  const onSortChange = useCallback(
    (key: string, direction: TableSortDirection) => {
      const params = new URLSearchParams(searchParamsString);
      params.set('sort', direction === 'desc' ? `-${key}` : key);
      params.delete('page');
      replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, replace, searchParamsString],
  );

  return {
    onSortChange,
    sort: sortKey
      ? `${sortKey}: ${sortDirection === 'desc' ? -1 : 1}`
      : undefined,
    sortDirection,
    sortKey,
  };
}
