'use client';

import type {
  IPagedItems,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import {
  type UseAuthedQueryOptions,
  useAuthedQuery,
} from '@hooks/auth/use-authed-query/use-authed-query';
import type { UseQueryResult } from '@tanstack/react-query';

export interface UsePagedAuthedQueryOptions<TService, TItem>
  extends Omit<UseAuthedQueryOptions<TService, IPagedItems<TItem>>, 'queryFn'> {
  /** Returns rows and totals from the same response. */
  queryFn: (
    service: TService,
    signal: AbortSignal,
  ) => Promise<
    Pick<IPaginatedResponse<TItem>, 'items' | 'total' | 'totalPages'>
  >;
}

/**
 * `useAuthedQuery` for a paginated list: each cached page keeps the totals its
 * own response returned. Pass `data?.totals ?? EMPTY_PAGE_TOTALS` to
 * AutoPagination so first-load and cached footers both belong to this list.
 */
export function usePagedAuthedQuery<TService, TItem>({
  queryFn,
  ...options
}: UsePagedAuthedQueryOptions<TService, TItem>): UseQueryResult<
  IPagedItems<TItem>,
  Error
> {
  return useAuthedQuery<TService, IPagedItems<TItem>>({
    ...options,
    queryFn: async (service, signal) => {
      const page = await queryFn(service, signal);
      return {
        items: page.items,
        totals: {
          totalDocs: Math.max(0, page.total),
          totalPages: Math.max(1, page.totalPages),
        },
      };
    },
  });
}
