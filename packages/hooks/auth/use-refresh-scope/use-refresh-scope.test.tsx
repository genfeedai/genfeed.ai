import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useRefreshScope } from '@hooks/auth/use-refresh-scope/use-refresh-scope';
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

interface Deferred {
  resolve: (rows: string[]) => void;
}

/** Reads resolve only when the test says so, in the order they started. */
const reads = vi.hoisted(() => ({ pending: [] as Deferred[] }));

interface RowsService {
  read: () => Promise<string[]>;
}

const rowsService = (): RowsService => ({
  read: () =>
    new Promise<string[]>((resolve) => {
      reads.pending.push({ resolve });
    }),
});

const SCOPE_KEY = ['rows', 'org-1'] as const;

function useRows(sort: string) {
  const query = useAuthedQuery({
    gcTime: Number.POSITIVE_INFINITY,
    keepPreviousDataWithin: SCOPE_KEY,
    queryFn: (service: RowsService) => service.read(),
    queryKey: [...SCOPE_KEY, { sort }],
    retry: false,
    service: rowsService,
    // The app's default: a revisit within 30s paints the cache without a read.
    staleTime: 30_000,
  });
  // Read during render: React Query re-renders only for the fields read.
  return { rows: query.data, refresh: useRefreshScope(SCOPE_KEY) };
}

let activeClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={activeClient}>{children}</QueryClientProvider>
  );
}

async function resolveRead(index: number, rows: string[]) {
  await waitFor(() => expect(reads.pending.length).toBeGreaterThan(index));
  await act(async () => {
    reads.pending[index].resolve(rows);
  });
}

describe('useRefreshScope', () => {
  beforeEach(() => {
    reads.pending = [];
    activeClient = new QueryClient();
  });

  it('does not let a read from before a delete bring the row back', async () => {
    const view = renderHook(({ sort }) => useRows(sort), {
      initialProps: { sort: 'name' },
      wrapper: Wrapper,
    });
    await resolveRead(0, ['kept', 'deleted']);
    await waitFor(() =>
      expect(view.result.current.rows).toEqual(['kept', 'deleted']),
    );

    // A new sort loads with the old rows still on screen; the row is deleted
    // before that read answers.
    view.rerender({ sort: 'date' });
    await waitFor(() => expect(reads.pending).toHaveLength(2));
    let refreshing: Promise<void> = Promise.resolve();
    act(() => {
      refreshing = view.result.current.refresh();
    });

    await resolveRead(1, ['kept', 'deleted']);
    await resolveRead(2, ['kept']);
    await act(() => refreshing);

    await waitFor(() => expect(view.result.current.rows).toEqual(['kept']));
  });

  it('re-reads another cached sort when the list comes back to it', async () => {
    const view = renderHook(({ sort }) => useRows(sort), {
      initialProps: { sort: 'name' },
      wrapper: Wrapper,
    });
    await resolveRead(0, ['a', 'b']);
    view.rerender({ sort: 'date' });
    await resolveRead(1, ['b', 'a']);
    await waitFor(() => expect(view.result.current.rows).toEqual(['b', 'a']));

    let refreshing: Promise<void> = Promise.resolve();
    act(() => {
      refreshing = view.result.current.refresh();
    });
    await resolveRead(2, ['b']);
    await act(() => refreshing);

    view.rerender({ sort: 'name' });
    await resolveRead(3, ['a']);

    await waitFor(() => expect(view.result.current.rows).toEqual(['a']));
  });
});
