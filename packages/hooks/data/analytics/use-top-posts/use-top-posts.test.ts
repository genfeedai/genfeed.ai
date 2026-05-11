import { useTopPosts } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTopContent = vi.fn();
const mockGetAnalyticsService = vi.fn();

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createCacheKey: vi.fn((...args: unknown[]) => args.join(':')),
  createLocalStorageCache: vi.fn(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  })),
}));

import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';

describe('useTopPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTopContent.mockResolvedValue([]);
    mockGetAnalyticsService.mockResolvedValue({
      getTopContent: mockGetTopContent,
    });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetAnalyticsService,
    );
    (useAnalyticsContext as ReturnType<typeof vi.fn>).mockReturnValue({
      dateRange: {
        endDate: new Date(2025, 0, 7),
        startDate: new Date(2025, 0, 1),
      },
      refreshTrigger: 0,
    });
  });

  it('returns top posts data from the service', async () => {
    const mockPosts = [{ platform: 'x', postId: 'post-1', totalViews: 10 }];
    mockGetTopContent.mockResolvedValue(mockPosts);

    const { result } = renderHook(
      () => useTopPosts({ limit: 5, metric: 'views' }),
      {
        wrapper: createQueryWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.topPosts).toEqual(mockPosts);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('fetches top posts with formatted date keys', async () => {
    const { result } = renderHook(
      () => useTopPosts({ brandId: 'brand-1', limit: 5, metric: 'views' }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetAnalyticsService).toHaveBeenCalledTimes(1);
    expect(mockGetTopContent).toHaveBeenCalledWith({
      brand: 'brand-1',
      endDate: '2025-01-07',
      limit: 5,
      metric: 'views',
      startDate: '2025-01-01',
    });
  });

  it('disables fetching when date range is missing', () => {
    (useAnalyticsContext as ReturnType<typeof vi.fn>).mockReturnValue({
      dateRange: {
        endDate: null,
        startDate: null,
      },
      refreshTrigger: 0,
    });

    const { result } = renderHook(() => useTopPosts(), {
      wrapper: createQueryWrapper(),
    });

    // Query should be disabled — service should not be called
    expect(mockGetAnalyticsService).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.topPosts).toEqual([]);
  });

  it('returns empty array when no data is fetched', async () => {
    mockGetTopContent.mockResolvedValue([]);

    const { result } = renderHook(() => useTopPosts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.topPosts).toEqual([]);
  });
});
