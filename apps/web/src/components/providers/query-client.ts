import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stale-while-revalidate: a query stays cached for 30 minutes after its
        // last use, so coming back to a page paints the cached data at once
        // (no skeleton) and the stale-time refetch below updates it quietly.
        // Switching organization clears the whole cache.
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
        // 30s: avoid refetch-on-every-mount storm. Mutations still invalidate
        // explicitly via queryClient.invalidateQueries — staleness is the floor,
        // not the ceiling.
        staleTime: 30_000,
      },
    },
  });
}
