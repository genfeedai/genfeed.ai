'use client';

import type { IPagedItems } from '@genfeedai/contracts/interfaces';
import { PagesService } from '@genfeedai/services/content/pages.service';
import {
  type UseAuthedQueryOptions,
  useAuthedQuery,
} from '@hooks/auth/use-authed-query/use-authed-query';
import type { UseQueryResult } from '@tanstack/react-query';

export interface UsePagedAuthedQueryOptions<TService, TItem>
  extends Omit<UseAuthedQueryOptions<TService, IPagedItems<TItem>>, 'queryFn'> {
  /** Reads one page of rows through a `findAll` that records page totals. */
  queryFn: (service: TService, signal: AbortSignal) => Promise<TItem[]>;
}

/**
 * `useAuthedQuery` for a paginated list: each cached page keeps the totals its
 * own request recorded, so `<AutoPagination totals={data?.totals} />` shows
 * that list's footer on a return visit instead of whichever list was read
 * last.
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
      const items = await queryFn(service, signal);
      return { items, totals: PagesService.snapshot() };
    },
  });
}
