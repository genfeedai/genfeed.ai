import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60_000,
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
