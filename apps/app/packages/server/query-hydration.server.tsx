import 'server-only';

import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { makeQueryClient } from '@ui/providers/query-client';
import type { ReactNode } from 'react';
import { cache } from 'react';

type PrefetchQueryOptions = Parameters<QueryClient['prefetchQuery']>[0];

const getServerQueryClient = cache(makeQueryClient);

export function setServerQueryData<TData>(queryKey: QueryKey, data: TData) {
  getServerQueryClient().setQueryData(queryKey, data);
}

export function prefetchServerQuery(options: PrefetchQueryOptions) {
  // Fire-and-forget so the RSC returns its shell immediately; the pending
  // query dehydrates with a live promise that streams to the client.
  // prefetchQuery swallows fetch rejections, and retry: false keeps a failed
  // fetch from holding the stream open — the client discards the rejected
  // entry and refetches itself.
  void getServerQueryClient().prefetchQuery({ ...options, retry: false });
}

export function ServerQueryHydrationBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <HydrationBoundary
      state={dehydrate(getServerQueryClient(), {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      })}
    >
      {children}
    </HydrationBoundary>
  );
}
