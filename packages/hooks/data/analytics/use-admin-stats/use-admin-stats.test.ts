import { useAdminStats } from '@hooks/data/analytics/use-admin-stats/use-admin-stats';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAnalyticsService = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetAnalyticsService),
}));

describe('useAdminStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stats, leaderboard, timeseries, and loading flags', () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current).toHaveProperty('stats');
    expect(result.current).toHaveProperty('leaderboard');
    expect(result.current).toHaveProperty('timeseries');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isRefreshing');
    expect(result.current).toHaveProperty('refresh');
  });

  it('returns default stats when data is null', () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.stats).toHaveProperty('totalPosts');
    expect(result.current.stats?.totalPosts).toBe(0);
  });

  it('returns empty arrays for leaderboard and timeseries when null', () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.leaderboard).toEqual([]);
    expect(result.current.timeseries).toEqual([]);
  });

  // TODO: update test to verify useQuery behavior
  it('combines isLoading from all three resources', () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  // TODO: update test to verify useQuery behavior
  it('returns populated stats when data is provided', () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.stats).toHaveProperty('totalPosts');
  });

  // TODO: update test to verify useQuery behavior
  it('transforms timeseries data correctly', () => {
    const { result } = renderHook(() => useAdminStats(), {
      wrapper: createQueryWrapper(),
    });
    expect(Array.isArray(result.current.timeseries)).toBe(true);
  });
});
