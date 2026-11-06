import { updateCachedQueries } from '@hooks/auth/update-cached-queries/update-cached-queries';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewer = vi.hoisted(() => ({
  getToken: async () => 'token',
  orgId: 'org-1',
  sessionId: 'session-1',
  userId: 'user-1',
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => viewer,
}));

const reads = vi.hoisted(() => ({
  pending: [] as Array<(rows: string[]) => void>,
}));

interface RowsService {
  read: () => Promise<string[]>;
}

const rowsService = (): RowsService => ({
  read: () =>
    new Promise<string[]>((resolve) => {
      reads.pending.push(resolve);
    }),
});

const SCOPE_KEY = ['rows', 'org-1'] as const;

function useRows(page: number) {
  const query = useAuthedQuery({
    keepPreviousDataWithin: SCOPE_KEY,
    queryFn: (service: RowsService) => service.read(),
    queryKey: [...SCOPE_KEY, { page }],
    retry: false,
    service: rowsService,
  });
  return { isPlaceholder: query.isPlaceholderData, rows: query.data };
}

let client: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('updateCachedQueries', () => {
  beforeEach(() => {
    reads.pending = [];
    client = new QueryClient();
  });

  it('still loads the page that was loading when the write landed', async () => {
    const view = renderHook(({ page }) => useRows(page), {
      initialProps: { page: 1 },
      wrapper: Wrapper,
    });
    await waitFor(() => expect(reads.pending).toHaveLength(1));
    await act(async () => reads.pending[0](['a']));
    await waitFor(() => expect(view.result.current.rows).toEqual(['a']));

    view.rerender({ page: 2 });
    await waitFor(() => expect(reads.pending).toHaveLength(2));
    await act(() =>
      updateCachedQueries<string[]>(client, { queryKey: SCOPE_KEY }, (rows) =>
        rows.map((row) => `${row}!`),
      ),
    );

    await waitFor(() => expect(reads.pending).toHaveLength(3));
    await act(async () => reads.pending[2](['b']));
    await waitFor(() =>
      expect(view.result.current).toEqual({
        isPlaceholder: false,
        rows: ['b'],
      }),
    );
  });

  it('keeps the write when a refresh of a loaded page was in flight', async () => {
    const view = renderHook(() => useRows(1), { wrapper: Wrapper });
    await waitFor(() => expect(reads.pending).toHaveLength(1));
    await act(async () => reads.pending[0](['a']));
    await waitFor(() => expect(view.result.current.rows).toEqual(['a']));

    act(() => {
      void client.invalidateQueries({ queryKey: SCOPE_KEY });
    });
    await waitFor(() => expect(reads.pending).toHaveLength(2));
    await act(() =>
      updateCachedQueries<string[]>(client, { queryKey: SCOPE_KEY }, (rows) =>
        rows.map((row) => `${row}!`),
      ),
    );
    // The cancelled refresh answers late; let React Query deliver anything
    // it would before checking the write held.
    await act(async () => {
      reads.pending[1](['a']);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.result.current.rows).toEqual(['a!']);
    expect(reads.pending).toHaveLength(2);
  });
});
