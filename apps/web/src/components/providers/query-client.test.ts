import { describe, expect, it } from 'vitest';
import { makeQueryClient } from '@/components/providers/query-client';

describe('makeQueryClient', () => {
  it('centralizes app query defaults for client and server hydration', () => {
    const queryClient = makeQueryClient();

    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    });
  });
});
