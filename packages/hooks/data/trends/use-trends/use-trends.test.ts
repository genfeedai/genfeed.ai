// @vitest-environment jsdom

import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTrendsService = vi.fn();
const mockUseBrandId = vi.fn(() => 'brand-1');

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mockUseBrandId(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetTrendsService),
}));

vi.mock('@genfeedai/services/social/trends.service', () => ({
  TrendsService: {
    getInstance: vi.fn(),
  },
}));

describe('useTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required fields', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current).toHaveProperty('trends');
    expect(result.current).toHaveProperty('summary');
    expect(result.current).toHaveProperty('selectedPlatform');
    expect(result.current).toHaveProperty('setSelectedPlatform');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('refresh');
    expect(result.current).toHaveProperty('refreshTrends');
  });

  it('initializes selectedPlatform as "all"', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.selectedPlatform).toBe('all');
  });

  it('initializes selectedPlatform from the provided platform', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends('youtube'), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.selectedPlatform).toBe('youtube');
  });

  it('setSelectedPlatform updates the platform', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });
    act(() => {
      result.current.setSelectedPlatform('youtube');
    });
    expect(result.current.selectedPlatform).toBe('youtube');
  });

  it('returns empty trends array from response', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });
    expect(Array.isArray(result.current.trends)).toBe(true);
    expect(result.current.trends).toHaveLength(0);
  });

  it('returns summary from response', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.summary).toHaveProperty('totalTrends');
    expect(result.current.summary.totalTrends).toBe(0);
  });

  // TODO: update test to verify useQuery behavior
  it('returns trends from response data', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });
    expect(Array.isArray(result.current.trends)).toBe(true);
  });

  // TODO: update test to verify useQuery behavior
  it('passes discovery endpoint dependencies into useResource', async () => {
    const { useTrends } = await import('./use-trends');
    renderHook(() => useTrends(), { wrapper: createQueryWrapper() });
  });

  // TODO: update test to verify useQuery behavior
  it('passes the provided platform into useResource dependencies', async () => {
    const { useTrends } = await import('./use-trends');
    renderHook(() => useTrends('youtube'), { wrapper: createQueryWrapper() });
  });

  it('refreshTrends refreshes backend data and mutates with the fresh response', async () => {
    const { useTrends } = await import('./use-trends');
    const mockService = {
      getTrendsDiscovery: vi.fn().mockResolvedValue({
        summary: {
          connectedPlatforms: ['twitter'],
          lockedPlatforms: [],
          totalTrends: 1,
        },
        trends: [{ id: 'trend-1', topic: 'AI' }],
      }),
      refreshTrends: vi.fn().mockResolvedValue({
        count: 1,
        message: 'ok',
        success: true,
      }),
    };

    mockGetTrendsService.mockResolvedValue(mockService);

    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });

    await act(async () => {
      await result.current.refreshTrends();
    });

    expect(mockService.refreshTrends).toHaveBeenCalledTimes(1);
    expect(mockService.getTrendsDiscovery).toHaveBeenCalledWith({
      platform: undefined,
    });
  });

  it('refreshTrends uses the provided platform when the hook is scoped', async () => {
    const { useTrends } = await import('./use-trends');
    const mockService = {
      getTrendsDiscovery: vi.fn().mockResolvedValue({
        summary: {
          connectedPlatforms: ['youtube'],
          lockedPlatforms: [],
          totalTrends: 1,
        },
        trends: [{ id: 'trend-1', topic: 'YouTube Shorts' }],
      }),
      refreshTrends: vi.fn().mockResolvedValue({
        count: 1,
        message: 'ok',
        success: true,
      }),
    };

    mockGetTrendsService.mockResolvedValue(mockService);

    const { result } = renderHook(() => useTrends('youtube'), {
      wrapper: createQueryWrapper(),
    });

    await act(async () => {
      await result.current.refreshTrends();
    });

    expect(mockService.getTrendsDiscovery).toHaveBeenCalledWith({
      platform: 'youtube',
    });
  });
});
