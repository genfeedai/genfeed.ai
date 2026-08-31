import { PageScope } from '@genfeedai/enums';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheStores } = vi.hoisted(() => ({
  cacheStores: new Map<string, Map<string, unknown>>(),
}));

const mockGetTimeSeries = vi.fn();
const mockGetAnalyticsService = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
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

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useTimeseries } from './use-timeseries';

const DATE_RANGE = {
  endDate: new Date('2025-01-07T00:00:00.000Z'),
  startDate: new Date('2025-01-01T00:00:00.000Z'),
};

describe('useTimeseries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const store of cacheStores.values()) {
      store.clear();
    }
    mockGetTimeSeries.mockResolvedValue([]);
    mockGetAnalyticsService.mockResolvedValue({
      getTimeSeries: mockGetTimeSeries,
    });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetAnalyticsService,
    );
  });

  it('fetches and transforms timeseries data per platform', async () => {
    mockGetTimeSeries.mockResolvedValue([
      {
        date: '2025-01-01',
        instagram: { views: 12 },
        twitter: { views: 7 },
      },
    ]);

    const { result } = renderHook(() =>
      useTimeseries({ dateRange: DATE_RANGE, scope: PageScope.ORGANIZATION }),
    );

    await waitFor(() => {
      expect(result.current.isTimeseriesLoading).toBe(false);
    });

    expect(mockGetTimeSeries).toHaveBeenCalledWith({
      endDate: '2025-01-07',
      startDate: '2025-01-01',
    });
    expect(result.current.timeseriesData).toEqual([
      {
        date: '2025-01-01',
        facebook: 0,
        instagram: 12,
        linkedin: 0,
        medium: 0,
        pinterest: 0,
        reddit: 0,
        tiktok: 0,
        twitter: 7,
        youtube: 0,
      },
    ]);
    expect(result.current.isTimeseriesUsingCache).toBe(false);
    expect(result.current.timeseriesCachedAt).toBeNull();
  });

  it('treats a non-array payload as empty data', async () => {
    mockGetTimeSeries.mockResolvedValue({ unexpected: true });

    const { result } = renderHook(() =>
      useTimeseries({ dateRange: DATE_RANGE, scope: PageScope.ORGANIZATION }),
    );

    await waitFor(() => {
      expect(result.current.isTimeseriesLoading).toBe(false);
    });

    expect(result.current.timeseriesData).toEqual([]);
  });

  it('skips the initial fetch when initial data is provided without revalidation', () => {
    const initialPoint = {
      date: '2025-01-01',
      facebook: 0,
      instagram: 1,
      linkedin: 0,
      medium: 0,
      pinterest: 0,
      reddit: 0,
      tiktok: 0,
      twitter: 0,
      youtube: 0,
    };

    const { result } = renderHook(() =>
      useTimeseries({
        dateRange: DATE_RANGE,
        initialCachedAt: '2025-01-05T00:00:00.000Z',
        initialData: [initialPoint],
        revalidateOnMount: false,
        scope: PageScope.ORGANIZATION,
      }),
    );

    expect(mockGetAnalyticsService).not.toHaveBeenCalled();
    expect(result.current.timeseriesData).toEqual([initialPoint]);
    expect(result.current.isTimeseriesLoading).toBe(false);
    expect(result.current.timeseriesCachedAt).toBe('2025-01-05T00:00:00.000Z');
  });

  it('falls back to cached data when the fetch fails', async () => {
    const cachedPoint = {
      date: '2025-01-02',
      facebook: 3,
      instagram: 0,
      linkedin: 0,
      medium: 0,
      pinterest: 0,
      reddit: 0,
      tiktok: 0,
      twitter: 0,
      youtube: 0,
    };
    const cacheKey = `timeseries:${PageScope.ORGANIZATION}:2025-01-01:2025-01-07`;
    cacheStores.get('analytics:timeseries:')?.set(cacheKey, [cachedPoint]);
    cacheStores
      .get('analytics:timeseries:meta:')
      ?.set(cacheKey, '2025-01-03T00:00:00.000Z');
    mockGetTimeSeries.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useTimeseries({ dateRange: DATE_RANGE, scope: PageScope.ORGANIZATION }),
    );

    await waitFor(() => {
      expect(result.current.isTimeseriesLoading).toBe(false);
    });

    expect(result.current.timeseriesData).toEqual([cachedPoint]);
    expect(result.current.isTimeseriesUsingCache).toBe(true);
    expect(result.current.timeseriesCachedAt).toBe('2025-01-03T00:00:00.000Z');
  });

  it('clears data when the fetch fails with no cache', async () => {
    mockGetTimeSeries.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useTimeseries({ dateRange: DATE_RANGE, scope: PageScope.ORGANIZATION }),
    );

    await waitFor(() => {
      expect(result.current.isTimeseriesLoading).toBe(false);
    });

    expect(result.current.timeseriesData).toEqual([]);
    expect(result.current.isTimeseriesUsingCache).toBe(false);
    expect(result.current.timeseriesCachedAt).toBeNull();
  });
});
