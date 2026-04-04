// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTrendsService = vi.fn();
const mockUseResource = vi.fn();
const mockUseBrandId = vi.fn(() => 'brand-1');

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mockUseBrandId(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetTrendsService),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

vi.mock('@services/social/trends.service', () => ({
  TrendsService: {
    getInstance: vi.fn(),
  },
}));

describe('useTrends', () => {
  const mockRefresh = vi.fn();
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseResource.mockReturnValue({
      data: {
        summary: {
          connectedPlatforms: [],
          lockedPlatforms: [],
          totalTrends: 0,
        },
        trends: [],
      },
      error: null,
      isLoading: false,
      isRefreshing: false,
      mutate: mockMutate,
      refresh: mockRefresh,
    });
  });

  it('returns required fields', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends());
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
    const { result } = renderHook(() => useTrends());
    expect(result.current.selectedPlatform).toBe('all');
  });

  it('initializes selectedPlatform from the provided platform', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends('youtube'));
    expect(result.current.selectedPlatform).toBe('youtube');
  });

  it('setSelectedPlatform updates the platform', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends());
    act(() => {
      result.current.setSelectedPlatform('youtube');
    });
    expect(result.current.selectedPlatform).toBe('youtube');
  });

  it('returns empty trends array from response', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends());
    expect(Array.isArray(result.current.trends)).toBe(true);
    expect(result.current.trends).toHaveLength(0);
  });

  it('returns summary from response', async () => {
    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends());
    expect(result.current.summary).toHaveProperty('totalTrends');
    expect(result.current.summary.totalTrends).toBe(0);
  });

  it('returns trends from response data', async () => {
    const { useTrends } = await import('./use-trends');
    const mockTrends = [{ id: '1', title: 'Trend 1' }];
    mockUseResource.mockReturnValue({
      data: {
        summary: {
          connectedPlatforms: ['youtube'],
          lockedPlatforms: [],
          totalTrends: 1,
        },
        trends: mockTrends,
      },
      error: null,
      isLoading: false,
      isRefreshing: false,
      mutate: mockMutate,
      refresh: mockRefresh,
    });
    const { result } = renderHook(() => useTrends());
    expect(result.current.trends).toHaveLength(1);
    expect(result.current.trends[0]).toEqual({ id: '1', title: 'Trend 1' });
  });

  it('passes discovery endpoint dependencies into useResource', async () => {
    const { useTrends } = await import('./use-trends');
    renderHook(() => useTrends());

    expect(mockUseResource).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        defaultValue: {
          summary: {
            connectedPlatforms: [],
            lockedPlatforms: [],
            totalTrends: 0,
          },
          trends: [],
        },
        dependencies: [undefined, 'brand-1'],
      }),
    );
  });

  it('passes the provided platform into useResource dependencies', async () => {
    const { useTrends } = await import('./use-trends');
    renderHook(() => useTrends('youtube'));

    expect(mockUseResource).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        dependencies: ['youtube', 'brand-1'],
      }),
    );
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

    const { result } = renderHook(() => useTrends());

    await act(async () => {
      await result.current.refreshTrends();
    });

    expect(mockService.refreshTrends).toHaveBeenCalledTimes(1);
    expect(mockService.getTrendsDiscovery).toHaveBeenCalledWith({
      platform: undefined,
    });
    expect(mockMutate).toHaveBeenCalledWith({
      summary: {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: [],
        totalTrends: 1,
      },
      trends: [{ id: 'trend-1', topic: 'AI' }],
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

    const { result } = renderHook(() => useTrends('youtube'));

    await act(async () => {
      await result.current.refreshTrends();
    });

    expect(mockService.getTrendsDiscovery).toHaveBeenCalledWith({
      platform: 'youtube',
    });
  });
});
