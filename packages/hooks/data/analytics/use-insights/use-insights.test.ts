import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(() => ({
    refreshTrigger: 0,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(
    (factory: (token: string) => unknown) => async () => factory('mock-token'),
  ),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockInsightsService = {
  getInsights: vi.fn().mockResolvedValue([]),
  markAsDismissed: vi.fn().mockResolvedValue(undefined),
  markAsRead: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@genfeedai/services/analytics/insights.service', () => ({
  InsightsService: {
    getInstance: vi.fn(() => mockInsightsService),
  },
}));

// Import after mocks
import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { useInsights } from '@hooks/data/analytics/use-insights/use-insights';

describe('useInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsightsService.getInsights.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with an empty insights array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.insights).toEqual([]);
    });

    it('should accept brandId option', async () => {
      const { result } = renderHook(
        () => useInsights({ brandId: 'brand_123' }),
        {
          wrapper: createQueryWrapper(),
        },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toBeDefined();
    });

    it('reloads insights when the Analytics sub-topbar Refresh bumps refreshTrigger', async () => {
      const context = { refreshTrigger: 0 };
      vi.mocked(useAnalyticsContext).mockImplementation(
        () => context as ReturnType<typeof useAnalyticsContext>,
      );
      const { rerender, result } = renderHook(
        () => useInsights({ brandId: 'brand_123' }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(mockInsightsService.getInsights).toHaveBeenCalledTimes(1);

      context.refreshTrigger = 1;
      rerender();

      await waitFor(() => {
        expect(mockInsightsService.getInsights).toHaveBeenCalledTimes(2);
      });
      vi.mocked(useAnalyticsContext).mockImplementation(
        () => ({ refreshTrigger: 0 }) as ReturnType<typeof useAnalyticsContext>,
      );
    });

    it('should accept enabled option', () => {
      const { result } = renderHook(() => useInsights({ enabled: false }), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current).toBeDefined();
    });

    it('should return loading state', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.isLoading).toBe('boolean');
      expect(typeof result.current.isRefreshing).toBe('boolean');
    });

    it('should return a null error when the fetch succeeds', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('empty');
    });
  });

  describe('return value completeness', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current).toHaveProperty('insights');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isRefreshing');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('status');
      expect(result.current).toHaveProperty('unavailableReason');
      expect(result.current).toHaveProperty('refresh');
      expect(result.current).toHaveProperty('markInsightRead');
      expect(result.current).toHaveProperty('dismissInsight');
    });

    it('should return functions for actions', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.markInsightRead).toBe('function');
      expect(typeof result.current.dismissInsight).toBe('function');
    });
  });

  describe('insight actions', () => {
    it('should call markAsRead on the insights service', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markInsightRead('insight-1');
      });

      expect(mockInsightsService.markAsRead).toHaveBeenCalledWith('insight-1');
    });

    it('should call markAsDismissed on the insights service', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.dismissInsight('insight-1');
      });

      expect(mockInsightsService.markAsDismissed).toHaveBeenCalledWith(
        'insight-1',
      );
    });

    it('should handle markInsightRead errors gracefully', async () => {
      mockInsightsService.markAsRead.mockRejectedValueOnce(
        new Error('API error'),
      );

      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not throw
      await act(async () => {
        await result.current.markInsightRead('insight-1');
      });

      expect(mockInsightsService.markAsRead).toHaveBeenCalled();
    });

    it('should handle dismissInsight errors gracefully', async () => {
      mockInsightsService.markAsDismissed.mockRejectedValueOnce(
        new Error('API error'),
      );

      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not throw
      await act(async () => {
        await result.current.dismissInsight('insight-1');
      });

      expect(mockInsightsService.markAsDismissed).toHaveBeenCalled();
    });
  });

  describe('refresh functionality', () => {
    it('should have refresh function', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('should call refresh without throwing', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.refresh()).resolves.not.toThrow();
      });
    });
  });

  describe('disabled state', () => {
    it('should not fetch data when disabled', () => {
      renderHook(() => useInsights({ enabled: false }), {
        wrapper: createQueryWrapper(),
      });

      expect(mockInsightsService.getInsights).not.toHaveBeenCalled();
    });
  });

  describe('options handling', () => {
    it('should work with no options', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toBeDefined();
    });

    it('should work with empty options object', async () => {
      const { result } = renderHook(() => useInsights({}), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toBeDefined();
    });

    it('should work with all options provided', async () => {
      const { result } = renderHook(
        () => useInsights({ brandId: 'brand_123', enabled: true }),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toBeDefined();
    });
  });
});

describe('insights unavailable state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsightsService.getInsights.mockRejectedValue(
      new Error('Not available'),
    );
  });

  it('returns an empty insights array and exposes the provider error', async () => {
    const { result } = renderHook(() => useInsights(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 3000 },
    );

    expect(result.current.status).toBe('unavailable');
    expect(result.current.unavailableReason).toBe('Not available');
    expect(result.current.insights).toEqual([]);
    expect(result.current.error?.message).toBe('Not available');
  });
});
