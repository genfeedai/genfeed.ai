import { PagesService } from '@genfeedai/services/content/pages.service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

interface ListService {
  findAll: () => Promise<string[]>;
}

/** A list read that records its totals the way `BaseService.findAll` does. */
function listService(rows: string[], pages: number, total: number) {
  return (): ListService => ({
    findAll: async () => {
      PagesService.recordTotals({ page: 1, pages, total });
      return rows;
    },
  });
}

let activeClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={activeClient}>{children}</QueryClientProvider>
  );
}

function useList(key: string, service: () => ListService) {
  return usePagedAuthedQuery({
    queryFn: (list: ListService) => list.findAll(),
    queryKey: ['list', key],
    service,
  });
}

describe('usePagedAuthedQuery', () => {
  it("keeps each cached page's own totals after another list was read", async () => {
    activeClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    });

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
    expect(PagesService.getTotalDocs()).toBe(200);
  });
});
