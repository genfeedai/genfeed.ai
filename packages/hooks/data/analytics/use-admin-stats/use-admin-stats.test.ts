import { useAdminStats } from '@hooks/data/analytics/use-admin-stats/use-admin-stats';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockGetOrganizationsLeaderboard = vi.fn();
const mockGetTimeSeries = vi.fn();

const mockAnalyticsService = {
  findAll: mockFindAll,
  getOrganizationsLeaderboard: mockGetOrganizationsLeaderboard,
  getTimeSeries: mockGetTimeSeries,
};

const mockGetAnalyticsService = vi.fn().mockResolvedValue(mockAnalyticsService);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetAnalyticsService),
}));

describe('useAdminStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue(null);
    mockGetOrganizationsLeaderboard.mockResolvedValue([]);
    mockGetTimeSeries.mockResolvedValue([]);
    mockGetAnalyticsService.mockResolvedValue(mockAnalyticsService);
  });

  it('returns stats, leaderboard, timeseries, and loading flags', async () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toHaveProperty('stats');
    expect(result.current).toHaveProperty('leaderboard');
    expect(result.current).toHaveProperty('timeseries');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isRefreshing');
    expect(result.current).toHaveProperty('refresh');
  });

  it('returns default stats when data is null', async () => {
    mockFindAll.mockResolvedValue(null);

    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toHaveProperty('totalPosts');
    expect(result.current.stats?.totalPosts).toBe(0);
  });

  it('returns empty arrays for leaderboard and timeseries when null', async () => {
    mockGetOrganizationsLeaderboard.mockResolvedValue(null);
    mockGetTimeSeries.mockResolvedValue(null);

    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.leaderboard).toEqual([]);
    expect(result.current.timeseries).toEqual([]);
  });

  it('returns populated stats when data is provided', async () => {
    const mockStats = { totalCredits: 999, totalPosts: 100, totalUsers: 50 };
    mockFindAll.mockResolvedValue(mockStats);

    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats?.totalPosts).toBe(100);
  });

  it('transforms timeseries data correctly', async () => {
    const mockTimeseries = [
      {
        date: '2024-01-01',
        tiktok: { likes: 5, views: 50 },
        youtube: { likes: 10, views: 100 },
      },
    ];
    mockGetTimeSeries.mockResolvedValue(mockTimeseries);

    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.timeseries).toHaveLength(1);
    expect(result.current.timeseries[0].date).toBe('2024-01-01');
    expect(result.current.timeseries[0].posts).toBe(150); // sum of views
  });

  it('provides refresh function that re-fetches all queries', async () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callCountBefore = mockFindAll.mock.calls.length;

    await result.current.refresh();

    await waitFor(() => {
      expect(mockFindAll.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });
});
