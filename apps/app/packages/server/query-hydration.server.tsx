import 'server-only';

import {
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
  return getServerQueryClient().prefetchQuery(options);
}

export function ServerQueryHydrationBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <HydrationBoundary state={dehydrate(getServerQueryClient())}>
      {children}
    </HydrationBoundary>
  );
}
