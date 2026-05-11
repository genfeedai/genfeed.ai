// @vitest-environment jsdom

import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
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

const emptyResponse = {
  summary: {
    connectedPlatforms: [],
    lockedPlatforms: [],
    totalTrends: 0,
  },
  trends: [],
};

describe('useTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: service returns empty discovery data
    mockGetTrendsService.mockResolvedValue({
      getTrendsDiscovery: vi.fn().mockResolvedValue(emptyResponse),
      refreshTrends: vi
        .fn()
        .mockResolvedValue({ count: 0, message: 'ok', success: true }),
    });
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

    // initialData provides empty arrays synchronously
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

  it('returns trends from fetched response data', async () => {
    const mockTrends = [{ id: '1', title: 'Trend 1' }];
    mockGetTrendsService.mockResolvedValue({
      getTrendsDiscovery: vi.fn().mockResolvedValue({
        summary: {
          connectedPlatforms: ['youtube'],
          lockedPlatforms: [],
          totalTrends: 1,
        },
        trends: mockTrends,
      }),
      refreshTrends: vi
        .fn()
        .mockResolvedValue({ count: 1, message: 'ok', success: true }),
    });

    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.trends).toHaveLength(1);
    });

    expect(result.current.trends[0]).toEqual({ id: '1', title: 'Trend 1' });
  });

  it('calls discovery without a platform filter when "all" is selected', async () => {
    const mockGetDiscovery = vi.fn().mockResolvedValue(emptyResponse);
    mockGetTrendsService.mockResolvedValue({
      getTrendsDiscovery: mockGetDiscovery,
      refreshTrends: vi.fn(),
    });

    const { useTrends } = await import('./use-trends');
    renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(mockGetTrendsService).toHaveBeenCalled();
    });

    expect(mockGetDiscovery).toHaveBeenCalledWith({ platform: undefined });
  });

  it('calls discovery with the provided platform when hook is scoped', async () => {
    const mockGetDiscovery = vi.fn().mockResolvedValue(emptyResponse);
    mockGetTrendsService.mockResolvedValue({
      getTrendsDiscovery: mockGetDiscovery,
      refreshTrends: vi.fn(),
    });

    const { useTrends } = await import('./use-trends');
    renderHook(() => useTrends('youtube'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(mockGetTrendsService).toHaveBeenCalled();
    });

    expect(mockGetDiscovery).toHaveBeenCalledWith({ platform: 'youtube' });
  });

  it('refreshTrends refreshes backend data and updates query cache with fresh response', async () => {
    const freshData = {
      summary: {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: [],
        totalTrends: 1,
      },
      trends: [{ id: 'trend-1', topic: 'AI' }],
    };

    const mockService = {
      getTrendsDiscovery: vi
        .fn()
        .mockResolvedValueOnce(emptyResponse) // initial fetch
        .mockResolvedValueOnce(freshData), // after refresh
      refreshTrends: vi.fn().mockResolvedValue({
        count: 1,
        message: 'ok',
        success: true,
      }),
    };

    mockGetTrendsService.mockResolvedValue(mockService);

    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refreshTrends();
    });

    expect(mockService.refreshTrends).toHaveBeenCalledTimes(1);
    expect(mockService.getTrendsDiscovery).toHaveBeenCalledWith({
      platform: undefined,
    });

    await waitFor(() => {
      expect(result.current.trends).toHaveLength(1);
    });

    expect(result.current.trends[0]).toEqual({ id: 'trend-1', topic: 'AI' });
  });

  it('refreshTrends uses the provided platform when the hook is scoped', async () => {
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

    const { useTrends } = await import('./use-trends');
    const { result } = renderHook(() => useTrends('youtube'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refreshTrends();
    });

    // The second call (inside refreshTrends) should use 'youtube'
    expect(mockService.getTrendsDiscovery).toHaveBeenCalledWith({
      platform: 'youtube',
    });
  });
});
