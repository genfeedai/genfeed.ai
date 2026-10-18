import { AnalyticsMetric } from '@genfeedai/contracts';
import type { AuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  type UseAdminStatsReturn,
  useAdminStats,
} from '@hooks/data/analytics/use-admin-stats/use-admin-stats';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  apiEndpoint: 'https://api-a.example.test/v1',
  factoryTokens: [] as string[],
  findAll: vi.fn<(token: string) => Promise<unknown>>(),
  getToken: vi.fn<AuthIdentity['getToken']>(),
  identity: {
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org-a',
    sessionId: 'session-a',
    userId: 'actor-a',
  } as Omit<AuthIdentity, 'getToken'>,
  leaderboard:
    vi.fn<
      (token: string, params: Record<string, unknown>) => Promise<unknown>
    >(),
  playwrightAuth: null as null | {
    isLoaded: boolean;
    isSignedIn: boolean;
    orgId: string;
    userId: string;
  },
  timeseries:
    vi.fn<
      (token: string, params: Record<string, unknown>) => Promise<unknown>
    >(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ ...fixture.identity, getToken: fixture.getToken }),
}));
vi.mock('@helpers/auth/auth.helper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@helpers/auth/auth.helper')>()),
  getPlaywrightAuthState: () => fixture.playwrightAuth,
}));
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return fixture.apiEndpoint;
    },
  },
}));
vi.mock('@genfeedai/services/analytics/analytics.service', () => ({
  AnalyticsService: {
    getInstance: (token: string) => {
      fixture.factoryTokens.push(token);
      return {
        findAll: () => fixture.findAll(token),
        getOrganizationsLeaderboard: (params: Record<string, unknown>) =>
          fixture.leaderboard(token, params),
        getTimeSeries: (params: Record<string, unknown>) =>
          fixture.timeseries(token, params),
      };
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

function payload(value: number, name: string) {
  return {
    leaderboard: [
      {
        avgEngagementRate: 1,
        growth: 0,
        organization: { id: name, name },
        rank: 1,
        totalEngagement: value,
        totalPosts: value,
        totalViews: value,
      },
    ],
    stats: {
      monthlyGrowth: 0,
      totalCredentialsConnected: 1,
      totalPosts: value,
      totalUsers: value + 1,
      totalViews: value,
      viewsGrowth: 0,
    },
    timeseries: [
      { date: '2026-10-17', youtube: { likes: value + 2, views: value } },
    ],
    visibleTimeseries: [
      {
        credits: value + 2,
        date: '2026-10-17',
        posts: value,
        users: value + 2,
      },
    ],
  };
}
const oldPayload = payload(101, 'private-a');
const newPayload = payload(202, 'private-b');
function respondWith(value: ReturnType<typeof payload>) {
  fixture.findAll.mockResolvedValue(value.stats);
  fixture.leaderboard.mockResolvedValue(value.leaderboard);
  fixture.timeseries.mockResolvedValue(value.timeseries);
}
function visible(value: UseAdminStatsReturn) {
  return {
    leaderboard: value.leaderboard,
    stats: value.stats,
    timeseries: value.timeseries,
  };
}
function expectedVisible(value: ReturnType<typeof payload>) {
  return {
    leaderboard: value.leaderboard,
    stats: value.stats,
    timeseries: value.visibleTimeseries,
  };
}
const emptyVisible = { leaderboard: [], stats: null, timeseries: [] };
const clients: QueryClient[] = [];
function createHarness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 300_000, retry: false, staleTime: 30_000 },
    },
  });
  clients.push(client);
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return { client, wrapper };
}
function becomeNextOwner(change: 'actor' | 'session' | 'organization' | 'API') {
  if (change === 'actor') fixture.identity.userId = 'actor-b';
  if (change === 'session') fixture.identity.sessionId = 'session-b';
  if (change === 'organization') fixture.identity.orgId = 'org-b';
  if (change === 'API') fixture.apiEndpoint = 'https://api-b.example.test/v1';
}
function disableAuth(reason: 'unloaded' | 'signed out' | 'missing user') {
  if (reason === 'unloaded') fixture.identity.isLoaded = false;
  if (reason === 'signed out') fixture.identity.isSignedIn = false;
  if (reason === 'missing user') fixture.identity.userId = null;
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.apiEndpoint = 'https://api-a.example.test/v1';
  fixture.factoryTokens.length = 0;
  fixture.identity = {
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org-a',
    sessionId: 'session-a',
    userId: 'actor-a',
  };
  fixture.playwrightAuth = null;
  fixture.getToken.mockImplementation(async () =>
    [
      fixture.identity.userId,
      fixture.identity.sessionId,
      fixture.identity.orgId,
    ].join(':'),
  );
  respondWith(oldPayload);
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.useRealTimers();
});

describe('useAdminStats', () => {
  it('returns the existing public shape and populated data', async () => {
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() =>
      expect(visible(result.current)).toEqual(expectedVisible(oldPayload)),
    );
    expect(Object.keys(result.current).sort()).toEqual([
      'isLoading',
      'isRefreshing',
      'leaderboard',
      'refresh',
      'stats',
      'timeseries',
    ]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('returns null stats when data is missing', async () => {
    fixture.findAll.mockResolvedValue(null);
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats).toBeNull();
  });

  it('returns empty arrays for null leaderboard and timeseries', async () => {
    fixture.leaderboard.mockResolvedValue(null);
    fixture.timeseries.mockResolvedValue(null);
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.leaderboard).toEqual([]);
    expect(result.current.timeseries).toEqual([]);
  });

  it('preserves metric aggregation across all seven platforms', async () => {
    fixture.timeseries.mockResolvedValue([
      {
        date: '2026-10-17',
        facebook: { likes: 1, views: 10 },
        instagram: { likes: 2, views: 20 },
        linkedin: { likes: 3, views: 30 },
        pinterest: { likes: 4, views: 40 },
        tiktok: { likes: 5, views: 50 },
        twitter: { likes: 6, views: 60 },
        youtube: { likes: 7, views: 70 },
      },
    ]);
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() =>
      expect(result.current.timeseries).toEqual([
        { credits: 28, date: '2026-10-17', posts: 280, users: 28 },
      ]),
    );
  });

  it('preserves POSTS/limit5 and the seven-day date request', async () => {
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fixture.leaderboard).toHaveBeenCalledWith(
      'actor-a:session-a:org-a',
      { limit: 5, sort: AnalyticsMetric.POSTS },
    );
    expect(fixture.timeseries).toHaveBeenCalledWith('actor-a:session-a:org-a', {
      endDate: '2026-10-18',
      startDate: '2026-10-11',
    });
  });

  it('refreshes all three current-owner resources', async () => {
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    respondWith(newPayload);
    await act(async () => result.current.refresh());
    await waitFor(() =>
      expect(visible(result.current)).toEqual(expectedVisible(newPayload)),
    );
    expect(fixture.findAll).toHaveBeenCalledTimes(2);
    expect(fixture.leaderboard).toHaveBeenCalledTimes(2);
    expect(fixture.timeseries).toHaveBeenCalledTimes(2);
  });

  it('retains same-owner data and refresh flags while a valid refresh is pending', async () => {
    const nextStats = deferred<unknown>();
    const nextLeaderboard = deferred<unknown>();
    const nextTimeseries = deferred<unknown>();
    const { result } = renderHook(useAdminStats, createHarness());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() =>
      expect(visible(result.current)).toEqual(expectedVisible(oldPayload)),
    );
    fixture.findAll.mockReturnValueOnce(nextStats.promise);
    fixture.leaderboard.mockReturnValueOnce(nextLeaderboard.promise);
    fixture.timeseries.mockReturnValueOnce(nextTimeseries.promise);
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refresh();
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(visible(result.current)).toEqual(expectedVisible(oldPayload));
    await act(async () => {
      nextStats.resolve(newPayload.stats);
      nextLeaderboard.resolve(newPayload.leaderboard);
      nextTimeseries.resolve(newPayload.timeseries);
      await refreshing;
    });
    await waitFor(() =>
      expect(visible(result.current)).toEqual(expectedVisible(newPayload)),
    );
    expect(result.current.isRefreshing).toBe(false);
  });

  it.each(['actor', 'session', 'organization', 'API'] as const)(
    'hides fresh prior-owner data immediately after a %s change',
    async (change) => {
      const next = deferred<unknown>();
      const { result, rerender } = renderHook(useAdminStats, createHarness());
      await waitFor(() =>
        expect(visible(result.current)).toEqual(expectedVisible(oldPayload)),
      );
      fixture.findAll.mockReturnValue(next.promise);
      fixture.leaderboard.mockReturnValue(next.promise);
      fixture.timeseries.mockReturnValue(next.promise);
      becomeNextOwner(change);
      rerender();
      expect(visible(result.current)).toEqual(emptyVisible);
      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(fixture.findAll).toHaveBeenCalledTimes(2));
      await act(async () => next.resolve(null));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    },
  );

  it.each(['unloaded', 'signed out', 'missing user'] as const)(
    'does not acquire or dispatch initially while %s, including manual refresh',
    async (reason) => {
      disableAuth(reason);
      const { result } = renderHook(useAdminStats, createHarness());
      await act(async () => result.current.refresh());
      expect(visible(result.current)).toEqual(emptyVisible);
      expect(fixture.getToken).not.toHaveBeenCalled();
      expect(fixture.factoryTokens).toEqual([]);
    },
  );

  it.each(['unloaded', 'signed out', 'missing user'] as const)(
    'masks warm data and refuses refresh while %s even with retained identity fields',
    async (reason) => {
      const { result, rerender } = renderHook(useAdminStats, createHarness());
      await waitFor(() =>
        expect(visible(result.current)).toEqual(expectedVisible(oldPayload)),
      );
      const before = fixture.factoryTokens.length;
      disableAuth(reason);
      rerender();
      expect(visible(result.current)).toEqual(emptyVisible);
      await act(async () => result.current.refresh());
      expect(fixture.factoryTokens).toHaveLength(before);
    },
  );

  it('guards disabled query functions even when fetched directly', async () => {
    fixture.identity.isLoaded = false;
    const { client, ...options } = createHarness();
    renderHook(useAdminStats, options);
    await act(async () => {
      await Promise.all(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.fetch()),
      );
    });
    expect(fixture.getToken).not.toHaveBeenCalled();
    expect(fixture.factoryTokens).toEqual([]);
  });

  it('preserves the existing canonical Playwright auth fallback', async () => {
    fixture.identity = {
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
      sessionId: null,
      userId: null,
    };
    fixture.playwrightAuth = {
      isLoaded: true,
      isSignedIn: true,
      orgId: 'fixture-org',
      userId: 'fixture-user',
    };
    const { result } = renderHook(useAdminStats, createHarness());
    await waitFor(() =>
      expect(visible(result.current)).toEqual(expectedVisible(oldPayload)),
    );
  });

  it('reuses fresh data for the same owner across remounts', async () => {
    const options = createHarness();
    const first = renderHook(useAdminStats, options);
    await waitFor(() =>
      expect(visible(first.result.current)).toEqual(
        expectedVisible(oldPayload),
      ),
    );
    first.unmount();
    const second = renderHook(useAdminStats, options);
    expect(visible(second.result.current)).toEqual(expectedVisible(oldPayload));
    await act(async () => Promise.resolve());
    expect(fixture.findAll).toHaveBeenCalledTimes(1);
    expect(fixture.getToken).toHaveBeenCalledTimes(3);
  });

  it.each(['replacement', 'unmount'] as const)(
    'does not dispatch cancelled token acquisitions after %s',
    async (transition) => {
      const previous = deferred<string | null>();
      fixture.getToken.mockReturnValue(previous.promise);
      const { result, rerender, unmount } = renderHook(
        useAdminStats,
        createHarness(),
      );
      await waitFor(() => expect(fixture.getToken).toHaveBeenCalledTimes(3));
      fixture.getToken.mockImplementation(async () => 'current-owner-token');
      if (transition === 'replacement') {
        becomeNextOwner('actor');
        rerender();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
      } else unmount();
      await act(async () => previous.resolve('obsolete-token'));
      expect(fixture.findAll.mock.calls.map(([token]) => token)).not.toContain(
        'obsolete-token',
      );
      expect(
        fixture.leaderboard.mock.calls.map(([token]) => token),
      ).not.toContain('obsolete-token');
      expect(
        fixture.timeseries.mock.calls.map(([token]) => token),
      ).not.toContain('obsolete-token');
    },
  );

  it.each(['unloaded', 'signed out', 'missing user'] as const)(
    'cancels pending token acquisition when auth becomes %s',
    async (reason) => {
      const previous = deferred<string | null>();
      fixture.getToken.mockReturnValue(previous.promise);
      const { result, rerender } = renderHook(useAdminStats, createHarness());
      await waitFor(() => expect(fixture.getToken).toHaveBeenCalledTimes(3));
      disableAuth(reason);
      rerender();
      await act(async () => previous.resolve('obsolete-token'));
      expect(fixture.findAll).not.toHaveBeenCalled();
      expect(fixture.leaderboard).not.toHaveBeenCalled();
      expect(fixture.timeseries).not.toHaveBeenCalled();
      expect(visible(result.current)).toEqual(emptyVisible);
    },
  );

  it.each(['success', 'failure'] as const)(
    'ignores late previous-owner %s for all three resources',
    async (completion) => {
      const previous = deferred<unknown>();
      fixture.findAll.mockReturnValueOnce(previous.promise);
      fixture.leaderboard.mockReturnValueOnce(previous.promise);
      fixture.timeseries.mockReturnValueOnce(previous.promise);
      const { result, rerender } = renderHook(useAdminStats, createHarness());
      await waitFor(() => expect(fixture.findAll).toHaveBeenCalledTimes(1));
      respondWith(newPayload);
      becomeNextOwner('actor');
      rerender();
      await waitFor(() =>
        expect(visible(result.current)).toEqual(expectedVisible(newPayload)),
      );
      await act(async () => {
        if (completion === 'success') previous.resolve(oldPayload.stats);
        else previous.reject(new Error('Obsolete owner failure'));
      });
      expect(visible(result.current)).toEqual(expectedVisible(newPayload));
      expect(result.current.isRefreshing).toBe(false);
    },
  );

  it.each(['success', 'failure'] as const)(
    'does not revive a cancelled A acquisition across A to B to A after %s',
    async (completion) => {
      const previous = deferred<string | null>();
      fixture.getToken.mockReturnValue(previous.promise);
      const { result, rerender } = renderHook(useAdminStats, createHarness());
      await waitFor(() => expect(fixture.getToken).toHaveBeenCalledTimes(3));
      fixture.getToken.mockImplementation(async () => 'current-owner-token');
      respondWith(newPayload);
      becomeNextOwner('actor');
      rerender();
      await waitFor(() =>
        expect(visible(result.current)).toEqual(expectedVisible(newPayload)),
      );
      respondWith(oldPayload);
      fixture.identity.userId = 'actor-a';
      rerender();
      await waitFor(() =>
        expect(visible(result.current)).toEqual(expectedVisible(oldPayload)),
      );
      await act(async () => {
        if (completion === 'success') previous.resolve('obsolete-token');
        else previous.reject(new Error('Obsolete token failure'));
      });
      expect(fixture.findAll.mock.calls.map(([token]) => token)).not.toContain(
        'obsolete-token',
      );
      expect(visible(result.current)).toEqual(expectedVisible(oldPayload));
    },
  );

  it('retains prefix-based invalidation for all three resources', async () => {
    const { client, ...options } = createHarness();
    const { result } = renderHook(useAdminStats, options);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      for (const prefix of [
        'admin-stats',
        'admin-leaderboard',
        'admin-timeseries',
      ])
        await client.invalidateQueries({ queryKey: [prefix] });
    });
    expect(fixture.findAll).toHaveBeenCalledTimes(2);
    expect(fixture.leaderboard).toHaveBeenCalledTimes(2);
    expect(fixture.timeseries).toHaveBeenCalledTimes(2);
  });
});
