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

/**
 * Start protected-route prefetch without holding the RSC response open.
 * Pending promises are serialized by the hydration boundary below, allowing
 * the route shell to paint while TanStack Query streams the result.
 */
export function prefetchServerQuery(options: PrefetchQueryOptions) {
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
