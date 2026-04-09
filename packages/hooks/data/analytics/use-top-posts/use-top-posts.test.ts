import { useTopPosts } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseResource = vi.fn();
const mockGetTopContent = vi.fn();
const mockGetAnalyticsService = vi.fn();

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
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
    mockUseResource.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
  });

  it('returns top posts data from useResource', () => {
    const refresh = vi.fn();
    mockUseResource.mockReturnValue({
      data: [{ platform: 'x', postId: 'post-1', totalViews: 10 }],
      error: null,
      isLoading: true,
      refresh,
    });

    const { result } = renderHook(() =>
      useTopPosts({ limit: 5, metric: 'views' }),
    );

    expect(result.current.topPosts).toEqual([
      { platform: 'x', postId: 'post-1', totalViews: 10 },
    ]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.refetch).toBe(refresh);
  });

  it('fetches top posts with formatted date keys', async () => {
    renderHook(() =>
      useTopPosts({ brandId: 'brand-1', limit: 5, metric: 'views' }),
    );

    const fetcher = mockUseResource.mock
      .calls[0]?.[0] as () => Promise<unknown>;
    await fetcher();

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

    renderHook(() => useTopPosts());

    const options = mockUseResource.mock.calls[0]?.[1] as {
      enabled?: boolean;
    };
    expect(options.enabled).toBe(false);
  });
});
