import { PageScope } from '@genfeedai/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheStores } = vi.hoisted(() => ({
  cacheStores: new Map<string, Map<string, unknown>>(),
}));

const mockGetOrganizationsLeaderboard = vi.fn();
const mockGetBrandsLeaderboard = vi.fn();
const mockGetAnalyticsService = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createCacheKey: (...parts: unknown[]) => parts.join(':'),
  createLocalStorageCache: ({ prefix }: { prefix: string }) => {
    const existing = cacheStores.get(prefix);
    const store = existing ?? new Map<string, unknown>();
    cacheStores.set(prefix, store);
    return {
      get: (key: string) => (store.has(key) ? store.get(key) : null),
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
    };
  },
}));

import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { QueryClient } from '@tanstack/react-query';
import {
  type UseLeaderboardsOptions,
  useLeaderboards,
} from './use-leaderboards';

let queryClient: QueryClient;

/** Every hook in a test shares one cache, as the app's provider does. */
function renderLeaderboards(options: UseLeaderboardsOptions) {
  return renderHook((props: UseLeaderboardsOptions) => useLeaderboards(props), {
    initialProps: options,
    wrapper: queryClientWrapper(queryClient),
  });
}

const DATE_RANGE = {
  endDate: new Date('2025-01-07T00:00:00.000Z'),
  startDate: new Date('2025-01-01T00:00:00.000Z'),
};

const ORG_ITEM = { id: 'org-1', name: 'Acme', totalViews: 100 };
const BRAND_ITEM = { id: 'brand-1', name: 'Brand', totalViews: 50 };

describe('useLeaderboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
    for (const store of cacheStores.values()) {
      store.clear();
    }
    mockGetOrganizationsLeaderboard.mockResolvedValue([ORG_ITEM]);
    mockGetBrandsLeaderboard.mockResolvedValue([BRAND_ITEM]);
    mockGetAnalyticsService.mockResolvedValue({
      getBrandsLeaderboard: mockGetBrandsLeaderboard,
      getOrganizationsLeaderboard: mockGetOrganizationsLeaderboard,
    });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetAnalyticsService,
    );
  });

  it('fetches both leaderboards for superadmin scope', async () => {
    const { result } = renderLeaderboards({
      dateRange: DATE_RANGE,
      scope: PageScope.SUPERADMIN,
    });

    await waitFor(() => {
      expect(result.current.isLeaderboardLoading).toBe(false);
    });

    expect(result.current.orgsLeaderboard).toEqual([ORG_ITEM]);
    expect(result.current.brandsLeaderboard).toEqual([BRAND_ITEM]);
    expect(result.current.isLeaderboardUsingCache).toBe(false);
    expect(result.current.leaderboardCachedAt).toBeNull();
    expect(mockGetOrganizationsLeaderboard).toHaveBeenCalledWith({
      endDate: '2025-01-07',
      limit: 5,
      sort: expect.any(String),
      startDate: '2025-01-01',
    });
  });

  it('skips the org leaderboard outside superadmin scope', async () => {
    const { result } = renderLeaderboards({
      dateRange: DATE_RANGE,
      scope: PageScope.ORGANIZATION,
    });

    await waitFor(() => {
      expect(result.current.isLeaderboardLoading).toBe(false);
    });

    expect(mockGetOrganizationsLeaderboard).not.toHaveBeenCalled();
    expect(result.current.orgsLeaderboard).toEqual([]);
    expect(result.current.brandsLeaderboard).toEqual([BRAND_ITEM]);
  });

  it('does not fetch when the date range has no keys', async () => {
    const { result } = renderLeaderboards({
      dateRange: { endDate: null, startDate: null },
      scope: PageScope.ORGANIZATION,
    });

    await act(async () => {
      await result.current.fetchLeaderboards();
    });

    expect(mockGetAnalyticsService).not.toHaveBeenCalled();
  });

  it('falls back to cached leaderboards when the fetch fails', async () => {
    const brandsStore = cacheStores.get('analytics:leaderboards:brands:');
    const brandsMetaStore = cacheStores.get(
      'analytics:leaderboards:brands:meta:',
    );
    const cacheKey = `leaderboard:brands:${PageScope.ORGANIZATION}:2025-01-01:2025-01-07`;
    brandsStore?.set(cacheKey, [BRAND_ITEM]);
    brandsMetaStore?.set(cacheKey, '2025-01-02T00:00:00.000Z');
    mockGetBrandsLeaderboard.mockRejectedValue(new Error('boom'));

    const { result } = renderLeaderboards({
      dateRange: DATE_RANGE,
      scope: PageScope.ORGANIZATION,
    });

    await waitFor(() => {
      expect(result.current.isLeaderboardLoading).toBe(false);
    });

    expect(result.current.brandsLeaderboard).toEqual([BRAND_ITEM]);
    expect(result.current.isLeaderboardUsingCache).toBe(true);
    expect(result.current.leaderboardCachedAt).toBe('2025-01-02T00:00:00.000Z');
  });

  it('clears cache flags when the fetch fails with no cached data', async () => {
    mockGetBrandsLeaderboard.mockRejectedValue(new Error('boom'));

    const { result } = renderLeaderboards({
      dateRange: DATE_RANGE,
      scope: PageScope.ORGANIZATION,
    });

    await waitFor(() => {
      expect(result.current.isLeaderboardLoading).toBe(false);
    });

    expect(result.current.isLeaderboardUsingCache).toBe(false);
    expect(result.current.leaderboardCachedAt).toBeNull();
  });

  it('paints the cached leaderboard on the first render when the page is opened again', async () => {
    const firstVisit = renderLeaderboards({
      dateRange: DATE_RANGE,
      scope: PageScope.ORGANIZATION,
    });
    await waitFor(() =>
      expect(firstVisit.result.current.brandsLeaderboard).toEqual([BRAND_ITEM]),
    );
    firstVisit.unmount();

    const firstRender: { brands: unknown[]; isLoading: boolean }[] = [];
    renderHook(
      () => {
        const state = useLeaderboards({
          dateRange: DATE_RANGE,
          scope: PageScope.ORGANIZATION,
        });
        firstRender.push({
          brands: state.brandsLeaderboard,
          isLoading: state.isLeaderboardLoading,
        });
        return state;
      },
      { wrapper: queryClientWrapper(queryClient) },
    );

    expect(firstRender[0]).toEqual({ brands: [BRAND_ITEM], isLoading: false });
  });

  it('re-reads changed dates, and on Refresh keeps the leaderboard on screen', async () => {
    const { rerender, result } = renderLeaderboards({
      dateRange: DATE_RANGE,
      refreshTrigger: 0,
      scope: PageScope.ORGANIZATION,
    });
    await waitFor(() =>
      expect(result.current.brandsLeaderboard).toEqual([BRAND_ITEM]),
    );

    const changedDates = {
      ...DATE_RANGE,
      startDate: new Date('2025-01-03T00:00:00.000Z'),
    };
    rerender({
      dateRange: changedDates,
      refreshTrigger: 0,
      scope: PageScope.ORGANIZATION,
    });
    await waitFor(() =>
      expect(mockGetBrandsLeaderboard).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: '2025-01-03' }),
      ),
    );
    await waitFor(() =>
      expect(result.current.isLeaderboardLoading).toBe(false),
    );

    const refreshed = { ...BRAND_ITEM, totalViews: 75 };
    mockGetBrandsLeaderboard.mockResolvedValue([refreshed]);
    rerender({
      dateRange: changedDates,
      refreshTrigger: 1,
      scope: PageScope.ORGANIZATION,
    });

    expect(result.current.isLeaderboardLoading).toBe(false);
    expect(result.current.brandsLeaderboard).toEqual([BRAND_ITEM]);
    await waitFor(() =>
      expect(result.current.brandsLeaderboard).toEqual([refreshed]),
    );
  });
});
