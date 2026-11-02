import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: async () => 'token',
    orgId: 'org-1',
    sessionId: 'session-1',
    userId: 'user-1',
  }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));

type ListPage = Pick<
  IPaginatedResponse<string>,
  'items' | 'total' | 'totalPages'
>;
interface ListService {
  findAllPage: () => Promise<ListPage>;
}

function listService(
  items: string[],
  totalPages: number,
  total: number,
): () => ListService {
  return () => ({ findAllPage: async () => ({ items, total, totalPages }) });
}

let activeClient: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={activeClient}>{children}</QueryClientProvider>
  );
}
function useList(key: string, service: () => ListService) {
  return usePagedAuthedQuery({
    queryFn: (list: ListService) => list.findAllPage(),
    queryKey: ['list', key],
    service,
  });
}

describe('usePagedAuthedQuery', () => {
  beforeEach(() => {
    activeClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
  });
  afterEach(() => {
    cleanup();
    activeClient.clear();
  });

  it("keeps each cached page's own totals after another list was read", async () => {
    const roles = renderHook(
      () => useList('roles', listService(['admin'], 3, 61)),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(roles.result.current.isSuccess).toBe(true));
    roles.unmount();
    const bots = renderHook(
      () => useList('bots', listService(['bot'], 9, 200)),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(bots.result.current.isSuccess).toBe(true));
    bots.unmount();
    const rolesAgain = renderHook(
      () => useList('roles', listService(['admin'], 3, 61)),
      { wrapper: Wrapper },
    );
    expect(rolesAgain.result.current.data).toEqual({
      items: ['admin'],
      totals: { totalDocs: 61, totalPages: 3 },
    });
  });

  it('keeps concurrent lists independent when the older request finishes last', async () => {
    const delayed = Promise.withResolvers<ListPage>();
    const lists = renderHook(
      () => ({
        roles: useList('roles', () => ({ findAllPage: () => delayed.promise }))
          .data,
        bots: useList('bots', listService(['bot'], 9, 200)).data,
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(lists.result.current.bots).toEqual({
        items: ['bot'],
        totals: { totalDocs: 200, totalPages: 9 },
      }),
    );
    await act(async () =>
      delayed.resolve({ items: ['admin'], total: 61, totalPages: 3 }),
    );
    await waitFor(() =>
      expect(lists.result.current.roles).toEqual({
        items: ['admin'],
        totals: { totalDocs: 61, totalPages: 3 },
      }),
    );
    expect(lists.result.current.bots).toEqual({
      items: ['bot'],
      totals: { totalDocs: 200, totalPages: 9 },
    });
  });

  it('keeps server totals for an empty page without borrowing another list count', async () => {
    const lists = renderHook(
      () => ({
        empty: useList('empty', listService([], 1, 0)).data,
        bots: useList('bots', listService(['bot'], 9, 200)).data,
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(lists.result.current.bots).toEqual({
        items: ['bot'],
        totals: { totalDocs: 200, totalPages: 9 },
      }),
    );
    await waitFor(() =>
      expect(lists.result.current.empty).toEqual({
        items: [],
        totals: { totalDocs: 0, totalPages: 1 },
      }),
    );
  });
});
