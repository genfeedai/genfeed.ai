'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  hashKey,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export interface UseAuthedQueryOptions<TService, TData>
  extends Omit<
    UseQueryOptions<TData, Error, TData, QueryKey>,
    'enabled' | 'placeholderData' | 'queryFn' | 'queryKey'
  > {
  /** False holds the read (scope not ready yet); it also waits for a user. */
  enabled?: boolean;
  /**
   * Keep the current rows on screen while the next key loads (a new page,
   * search or sort), but only when the previous key starts with this prefix.
   * Pass the scope part of the key (resource, organization, brand) so one
   * scope's data is never shown under another. Another viewer's rows are
   * never kept, whatever the prefix.
   */
  keepPreviousDataWithin?: QueryKey;
  /**
   * What the data is, without the viewer: the resource plus every scope and
   * filter it depends on (organization, brand, page, date range...). The
   * signed-in user and organization are appended here, so one viewer's cache is
   * never painted for another.
   */
  queryKey: QueryKey;
  /** Builds the API service from a fresh auth token. */
  service: (token: string) => TService;
  /** Reads the data. Pass `signal` on, so a superseded read is cancelled. */
  queryFn: (service: TService, signal: AbortSignal) => Promise<TData>;
  /**
   * A value that changes when the user asks for fresh data (the analytics
   * subbar Refresh). A change re-reads in the background and keeps the current
   * data on screen; it is not part of the cache key, so it never brings the
   * skeleton back.
   */
  refreshKey?: unknown;
}

/** The key part that names the viewer; `useAuthedQuery` appends it last. */
export function viewerKeyPart(
  userId: string | null | undefined,
  orgId: string | null | undefined,
): { viewer: [string | null, string | null] } {
  return { viewer: [userId ?? null, orgId ?? null] };
}

/**
 * True when a full cached key belongs to this viewer. Pass it as a
 * `predicate` so a cache write after a mutation never touches the cache of a
 * viewer who signed in meanwhile.
 */
export function isViewerQueryKey(
  key: QueryKey,
  userId: string | null | undefined,
  orgId: string | null | undefined,
): boolean {
  return hashKey(key.slice(-1)) === hashKey([viewerKeyPart(userId, orgId)]);
}

/**
 * Compares by value, the way React Query matches keys: scope parts are often
 * objects (`{ brandId, status }`) rebuilt on every render.
 */
function startsWithKey(key: QueryKey, prefix: QueryKey): boolean {
  return (
    key.length >= prefix.length &&
    hashKey(key.slice(0, prefix.length)) === hashKey(prefix)
  );
}

/**
 * The one way a page reads authed API data.
 *
 * It is React Query underneath, so a page that was already loaded paints its
 * cached data straight away when you come back, and refreshes in the
 * background once the data is stale. Render the skeleton on `isLoading` (no
 * data yet and a read in flight), never on `isFetching`, which is also true
 * for a quiet background refresh.
 *
 * Mutations invalidate by the same `queryKey` prefix: the viewer suffix sits at
 * the end, so `invalidateQueries({ queryKey: ['outliers'] })` still matches.
 */
export function useAuthedQuery<TService, TData>({
  enabled = true,
  keepPreviousDataWithin,
  queryFn,
  queryKey,
  refreshKey,
  service,
  ...options
}: UseAuthedQueryOptions<TService, TData>): UseQueryResult<TData, Error> {
  const { orgId, userId } = useAuthIdentity();
  const getService = useAuthedService(service);
  const isEnabled = enabled && Boolean(userId);
  const viewerKey = viewerKeyPart(userId, orgId);

  const query = useQuery<TData, Error, TData, QueryKey>({
    ...options,
    enabled: isEnabled,
    placeholderData: keepPreviousDataWithin
      ? (previous, previousQuery) =>
          previousQuery &&
          startsWithKey(previousQuery.queryKey, keepPreviousDataWithin) &&
          isViewerQueryKey(previousQuery.queryKey, userId, orgId)
            ? previous
            : undefined
      : undefined,
    queryFn: async ({ signal }) => queryFn(await getService(), signal),
    queryKey: [...queryKey, viewerKey],
  });

  const { refetch } = query;
  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (Object.is(lastRefreshKeyRef.current, refreshKey)) {
      return;
    }
    lastRefreshKeyRef.current = refreshKey;
    if (isEnabled) {
      void refetch();
    }
  }, [isEnabled, refetch, refreshKey]);

  return query;
}
