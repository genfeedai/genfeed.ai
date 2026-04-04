import { useAdminStats } from '@hooks/data/analytics/use-admin-stats/use-admin-stats';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAnalyticsService = vi.fn();
const mockUseResource = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetAnalyticsService),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

describe('useAdminStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseResource.mockReturnValue({
      data: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    });
  });

  it('returns stats, leaderboard, timeseries, and loading flags', () => {
    const { result } = renderHook(() => useAdminStats());

    expect(result.current).toHaveProperty('stats');
    expect(result.current).toHaveProperty('leaderboard');
    expect(result.current).toHaveProperty('timeseries');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isRefreshing');
    expect(result.current).toHaveProperty('refresh');
  });

  it('returns default stats when data is null', () => {
    const { result } = renderHook(() => useAdminStats());
    expect(result.current.stats).toHaveProperty('totalPosts');
    expect(result.current.stats?.totalPosts).toBe(0);
  });

  it('returns empty arrays for leaderboard and timeseries when null', () => {
    const { result } = renderHook(() => useAdminStats());
    expect(result.current.leaderboard).toEqual([]);
    expect(result.current.timeseries).toEqual([]);
  });

  it('combines isLoading from all three resources', () => {
    mockUseResource
      .mockReturnValueOnce({
        data: null,
        isLoading: true,
        isRefreshing: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: null,
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: null,
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      });

    const { result } = renderHook(() => useAdminStats());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns populated stats when data is provided', () => {
    const mockStats = { totalCredits: 999, totalPosts: 100, totalUsers: 50 };
    mockUseResource
      .mockReturnValueOnce({
        data: mockStats,
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      });

    const { result } = renderHook(() => useAdminStats());
    expect(result.current.stats?.totalPosts).toBe(100);
  });

  it('transforms timeseries data correctly', () => {
    const mockTimeseries = [
      {
        date: '2024-01-01',
        tiktok: { likes: 5, views: 50 },
        youtube: { likes: 10, views: 100 },
      },
    ];
    mockUseResource
      .mockReturnValueOnce({
        data: null,
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: mockTimeseries,
        isLoading: false,
        isRefreshing: false,
        refresh: vi.fn(),
      });

    const { result } = renderHook(() => useAdminStats());
    expect(result.current.timeseries).toHaveLength(1);
    expect(result.current.timeseries[0].date).toBe('2024-01-01');
    expect(result.current.timeseries[0].posts).toBe(150); // sum of views
  });
});
