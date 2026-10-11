import { useWinnerPosts } from '@hooks/data/analytics/use-winner-posts/use-winner-posts';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetWinners = vi.fn();
const mockGetAnalyticsService = vi.fn();

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';

describe('useWinnerPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWinners.mockResolvedValue([]);
    mockGetAnalyticsService.mockResolvedValue({ getWinners: mockGetWinners });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetAnalyticsService,
    );
    (useAnalyticsContext as ReturnType<typeof vi.fn>).mockReturnValue({
      dateRange: {
        endDate: new Date('2025-01-07T00:00:00.000Z'),
        startDate: new Date('2025-01-01T00:00:00.000Z'),
      },
      refreshTrigger: 0,
    });
  });

  it('reads winners for the analytics date range', async () => {
    const winners = [{ evidence: [], platform: 'instagram', postId: 'post-1' }];
    mockGetWinners.mockResolvedValue(winners);

    const { result } = renderHook(
      () => useWinnerPosts({ limit: 20, platform: 'instagram' }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.winners).toEqual(winners);
    });
    expect(mockGetWinners).toHaveBeenCalledWith({
      endDate: '2025-01-07',
      limit: 20,
      platform: 'instagram',
      startDate: '2025-01-01',
    });
  });

  it('does not fetch while disabled', async () => {
    const { result } = renderHook(() => useWinnerPosts({ isEnabled: false }), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.winners).toEqual([]);
    expect(mockGetWinners).not.toHaveBeenCalled();
  });
});
