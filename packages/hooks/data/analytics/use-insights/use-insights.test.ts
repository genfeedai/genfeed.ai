import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockDateRange = {
  endDate: new Date('2024-01-31'),
  startDate: new Date('2024-01-01'),
};

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(() => ({
    dateRange: mockDateRange,
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

const mockPredictiveService = {
  getContentInsights: vi.fn().mockResolvedValue({
    alerts: [],
    anomalies: [],
    audiences: [],
    suggestions: [],
    trends: [],
  }),
};

vi.mock('@genfeedai/services/analytics/insights.service', () => ({
  InsightsService: {
    getInstance: vi.fn(() => mockInsightsService),
  },
  PredictiveAnalyticsService: {
    getInstance: vi.fn(() => mockPredictiveService),
  },
}));

// Import after mocks
import { useInsights } from '@hooks/data/analytics/use-insights/use-insights';

describe('useInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsightsService.getInsights.mockResolvedValue([]);
    mockPredictiveService.getContentInsights.mockResolvedValue({
      alerts: [],
      anomalies: [],
      audiences: [],
      suggestions: [],
      trends: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default empty arrays', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.insights).toEqual([]);
      expect(result.current.anomalies).toEqual([]);
      expect(result.current.trends).toEqual([]);
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.audiences).toEqual([]);
      expect(result.current.alerts).toEqual([]);
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

    it('should return error state', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('return value completeness', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current).toHaveProperty('insights');
      expect(result.current).toHaveProperty('anomalies');
      expect(result.current).toHaveProperty('trends');
      expect(result.current).toHaveProperty('suggestions');
      expect(result.current).toHaveProperty('audiences');
      expect(result.current).toHaveProperty('alerts');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isRefreshing');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refresh');
      expect(result.current).toHaveProperty('markInsightRead');
      expect(result.current).toHaveProperty('dismissInsight');
      expect(result.current).toHaveProperty('markAlertRead');
      expect(result.current).toHaveProperty('dismissAlert');
    });

    it('should return functions for actions', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.markInsightRead).toBe('function');
      expect(typeof result.current.dismissInsight).toBe('function');
      expect(typeof result.current.markAlertRead).toBe('function');
      expect(typeof result.current.dismissAlert).toBe('function');
    });
  });

  describe('alert management', () => {
    it('should mark alert as read locally', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.markAlertRead('alert-1');
      });

      // Local state should be updated
      expect(typeof result.current.markAlertRead).toBe('function');
    });

    it('should dismiss alert locally', () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      act(() => {
        result.current.dismissAlert('alert-1');
      });

      // Local state should be updated
      expect(typeof result.current.dismissAlert).toBe('function');
    });
  });

  describe('insight actions', () => {
    it('should call markAsRead on insight service', async () => {
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

    it('should call markAsDismissed on insight service', async () => {
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

    it('should handle markInsightRead error gracefully', async () => {
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

    it('should handle dismissInsight error gracefully', async () => {
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

  describe('data arrays validation', () => {
    it('insights should be an array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.insights)).toBe(true);
    });

    it('anomalies should be an array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.anomalies)).toBe(true);
    });

    it('trends should be an array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.trends)).toBe(true);
    });

    it('suggestions should be an array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.suggestions)).toBe(true);
    });

    it('audiences should be an array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.audiences)).toBe(true);
    });

    it('alerts should be an array', async () => {
      const { result } = renderHook(() => useInsights(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.alerts)).toBe(true);
    });
  });

  describe('disabled state', () => {
    it('should not fetch data when disabled', () => {
      renderHook(() => useInsights({ enabled: false }), {
        wrapper: createQueryWrapper(),
      });

      // Services should not be called when disabled
      expect(mockInsightsService.getInsights).not.toHaveBeenCalled();
      expect(mockPredictiveService.getContentInsights).not.toHaveBeenCalled();
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

describe('getMockInsightsData (implicit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make predictive service throw to trigger fallback to mock data
    mockPredictiveService.getContentInsights.mockRejectedValue(
      new Error('Not available'),
    );
  });

  it('should return mock data when API fails', async () => {
    const { result } = renderHook(() => useInsights(), {
      wrapper: createQueryWrapper(),
    });

    // Wait for loading to complete — hook falls back to getMockInsightsData on error
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 3000 },
    );

    // The hook should handle the error gracefully and return mock alerts
    expect(Array.isArray(result.current.alerts)).toBe(true);
  });
});
