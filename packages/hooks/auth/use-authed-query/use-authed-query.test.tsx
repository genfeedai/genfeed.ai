import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({
  current: {
    getToken: async () => 'token-a' as string | null,
    orgId: 'org-a' as string | null,
    sessionId: 'session-a',
    userId: 'user-a' as string | null,
  },
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identity.current,
}));

interface ReportService {
  token: string;
  read: (signal: AbortSignal) => Promise<string[]>;
}

function reportService(rows: string[]) {
  return (token: string): ReportService => ({
    read: async () => rows.map((row) => `${row}:${token}`),
    token,
  });
}

let activeClient: QueryClient;

function QueryTestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={activeClient}>{children}</QueryClientProvider>
  );
}

function wrapperFor(client: QueryClient) {
  activeClient = client;
  return QueryTestWrapper;
}

function useReport(rows: string[], enabled = true, refreshKey = 0) {
  return useAuthedQuery({
    enabled,
    queryFn: (service: ReportService, signal) => service.read(signal),
    queryKey: ['report', 'brand-1'],
    refreshKey,
    service: reportService(rows),
  });
}

/** Records what the hook returned on its very first render. */
function firstRenderOf<T>(read: () => T, client: QueryClient) {
  const renders: T[] = [];
  const view = renderHook(
    () => {
      const value = read();
      renders.push(value);
      return value;
    },
    { wrapper: wrapperFor(client) },
  );
  return { first: renders[0], view };
}

describe('useAuthedQuery', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { gcTime: 60_000, retry: false } },
    });
    identity.current = {
      getToken: async () => 'token-a',
      orgId: 'org-a',
      sessionId: 'session-a',
      userId: 'user-a',
    };
  });

  it('is loading with no data on a cold first visit, then returns the data read with the token', async () => {
    const { first, view } = firstRenderOf(() => useReport(['row']), client);

    expect(first?.isLoading).toBe(true);
    expect(first?.data).toBeUndefined();
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['row:token-a']),
    );
  });

  it('paints the cached data on the first render when the page is opened again', async () => {
    const firstVisit = renderHook(() => useReport(['row']), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() =>
      expect(firstVisit.result.current.data).toEqual(['row:token-a']),
    );
    firstVisit.unmount();

    const { first } = firstRenderOf(() => useReport(['row']), client);

    expect(first?.isLoading).toBe(false);
    expect(first?.data).toEqual(['row:token-a']);
  });

  it('never paints another viewer’s cached data', async () => {
    const firstVisit = renderHook(() => useReport(['row']), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() =>
      expect(firstVisit.result.current.data).toEqual(['row:token-a']),
    );
    firstVisit.unmount();

    identity.current = {
      getToken: async () => 'token-b',
      orgId: 'org-b',
      sessionId: 'session-b',
      userId: 'user-b',
    };
    const { first, view } = firstRenderOf(() => useReport(['row']), client);

    expect(first?.data).toBeUndefined();
    expect(first?.isLoading).toBe(true);
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['row:token-b']),
    );
  });

  it('holds the read while disabled or signed out', () => {
    const disabled = renderHook(() => useReport(['row'], false), {
      wrapper: wrapperFor(client),
    });
    expect(disabled.result.current.fetchStatus).toBe('idle');
    expect(disabled.result.current.isLoading).toBe(false);

    identity.current = { ...identity.current, userId: null };
    const signedOut = renderHook(() => useReport(['row']), {
      wrapper: wrapperFor(client),
    });
    expect(signedOut.result.current.fetchStatus).toBe('idle');
  });

  it('re-reads in the background on Refresh and keeps the current rows on screen', async () => {
    const view = renderHook(
      ({ rows, refreshKey }) => useReport(rows, true, refreshKey),
      {
        initialProps: { refreshKey: 0, rows: ['old'] },
        wrapper: wrapperFor(client),
      },
    );
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['old:token-a']),
    );

    view.rerender({ refreshKey: 1, rows: ['new'] });

    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.data).toEqual(['old:token-a']);
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['new:token-a']),
    );
  });

  it('keeps the previous rows while the next page loads, within the same scope only', async () => {
    const view = renderHook(
      ({ brand, page }) =>
        useAuthedQuery({
          keepPreviousDataWithin: ['report', brand],
          queryFn: (service: ReportService, signal) => service.read(signal),
          queryKey: ['report', brand, page],
          service: reportService([`${brand}-${page}`]),
        }),
      {
        initialProps: { brand: 'brand-1', page: 1 },
        wrapper: wrapperFor(client),
      },
    );
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['brand-1-1:token-a']),
    );

    view.rerender({ brand: 'brand-1', page: 2 });
    expect(view.result.current.data).toEqual(['brand-1-1:token-a']);
    expect(view.result.current.isLoading).toBe(false);
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['brand-1-2:token-a']),
    );

    view.rerender({ brand: 'brand-2', page: 2 });
    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.isLoading).toBe(true);
  });
  it('matches an object scope by value, so a scope rebuilt each render keeps the rows', async () => {
    const view = renderHook(
      ({ brand, page }) =>
        useAuthedQuery({
          keepPreviousDataWithin: ['report', { brand }],
          queryFn: (service: ReportService, signal) => service.read(signal),
          queryKey: ['report', { brand }, { page }],
          service: reportService([`${brand}-${page}`]),
        }),
      {
        initialProps: { brand: 'brand-1', page: 1 },
        wrapper: wrapperFor(client),
      },
    );
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['brand-1-1:token-a']),
    );

    view.rerender({ brand: 'brand-1', page: 2 });
    expect(view.result.current.data).toEqual(['brand-1-1:token-a']);
    expect(view.result.current.isLoading).toBe(false);

    view.rerender({ brand: 'brand-2', page: 2 });
    expect(view.result.current.data).toBeUndefined();
  });

  it('drops the previous rows when the viewer changes on a mounted list', async () => {
    const view = renderHook(
      () =>
        useAuthedQuery({
          keepPreviousDataWithin: ['report'],
          queryFn: (service: ReportService, signal) => service.read(signal),
          queryKey: ['report', 'brand-1'],
          service: (token: string): ReportService => ({
            read: () =>
              token === 'token-a'
                ? Promise.resolve(['secret:token-a'])
                : new Promise<string[]>(() => {}),
            token,
          }),
        }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() =>
      expect(view.result.current.data).toEqual(['secret:token-a']),
    );

    identity.current = {
      getToken: async () => 'token-b',
      orgId: 'org-a',
      sessionId: 'session-b',
      userId: 'user-b',
    };
    view.rerender();

    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.isLoading).toBe(true);
  });
});
