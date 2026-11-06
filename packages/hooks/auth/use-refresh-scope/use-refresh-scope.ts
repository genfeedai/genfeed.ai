'use client';

import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Re-reads a list after a mutation, across every cached page, search and sort
 * under `scopeKey` (the same prefix passed as `keepPreviousDataWithin`).
 *
 * A plain `refetch()` is not enough. While a key that has no data yet is
 * loading, React Query hands `refetch` the read already in flight, which
 * started before the mutation and can bring a deleted row back. It also leaves
 * the other cached variants as they were. This cancels the reads in flight
 * first, drops the variants nobody shows, then re-reads the ones on screen.
 */
export function useRefreshScope(scopeKey: QueryKey): () => Promise<void> {
  const queryClient = useQueryClient();
  const scopeKeyRef = useRef(scopeKey);

  useEffect(() => {
    scopeKeyRef.current = scopeKey;
  }, [scopeKey]);

  return useCallback(async () => {
    const queryKey = scopeKeyRef.current;
    await queryClient.cancelQueries({ queryKey });
    // A cached page or sort nobody shows now would paint its old rows on the
    // next visit; drop it, so that visit reads afresh.
    queryClient.removeQueries({ queryKey, type: 'inactive' });
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);
}
