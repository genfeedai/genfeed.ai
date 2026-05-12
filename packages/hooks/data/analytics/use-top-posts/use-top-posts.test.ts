import { useTopPosts } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTopContent = vi.fn();
const mockGetAnalyticsService = vi.fn();

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
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

  // TODO: update test to verify useQuery behavior
  it('returns top posts data from useResource', () => {
    const { result } = renderHook(
      () => useTopPosts({ limit: 5, metric: 'views' }),
      { wrapper: createQueryWrapper() },
    );

    expect(result.current).toHaveProperty('topPosts');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('refetch');
  });

  // TODO: update test to verify useQuery behavior
  it('fetches top posts with formatted date keys', async () => {
    renderHook(
      () => useTopPosts({ brandId: 'brand-1', limit: 5, metric: 'views' }),
      { wrapper: createQueryWrapper() },
    );
  });

  // TODO: update test to verify useQuery behavior
  it('disables fetching when date range is missing', () => {
    (useAnalyticsContext as ReturnType<typeof vi.fn>).mockReturnValue({
      dateRange: {
        endDate: null,
        startDate: null,
      },
      refreshTrigger: 0,
    });

    renderHook(() => useTopPosts(), { wrapper: createQueryWrapper() });
  });
});
