// @vitest-environment jsdom
'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
  useOptionalAnalyticsContext,
} from '@genfeedai/contexts/analytics/analytics-context';
import type { AnalyticsContextType } from '@genfeedai/contracts/interfaces/analytics/analytics-context.interface';
import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useBrandMock = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

let contextValue: AnalyticsContextType;

function Consumer(): null {
  contextValue = useAnalyticsContext();
  return null;
}

describe('AnalyticsProvider behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandMock.mockReturnValue({ brandId: 'brand_ctx' });
  });

  it('defaults to a 7-day range ending yesterday', () => {
    render(
      <AnalyticsProvider>
        <Consumer />
      </AnalyticsProvider>,
    );

    const { endDate, startDate } = contextValue.dateRange;
    if (!endDate || !startDate) {
      throw new Error('expected a default date range');
    }
    const dayMs = 24 * 60 * 60 * 1000;
    expect(endDate.getTime()).toBeLessThan(Date.now());
    expect(endDate.getTime() - startDate.getTime()).toBe(6 * dayMs);
    expect(contextValue.filters).toEqual({});
    expect(contextValue.isRefreshing).toBe(false);
    expect(contextValue.refreshTrigger).toBe(0);
  });

  it('does not read the brand context unless syncing is enabled', () => {
    render(
      <AnalyticsProvider>
        <Consumer />
      </AnalyticsProvider>,
    );
    expect(contextValue.brandId).toBeUndefined();
  });

  it('mirrors the brand context brand when syncing is enabled', () => {
    render(
      <AnalyticsProvider syncWithBrandContext>
        <Consumer />
      </AnalyticsProvider>,
    );
    expect(contextValue.brandId).toBe('brand_ctx');
  });

  it('setBrandId overrides the context brand until the context brand changes', () => {
    const { rerender } = render(
      <AnalyticsProvider syncWithBrandContext>
        <Consumer />
      </AnalyticsProvider>,
    );

    act(() => {
      contextValue.setBrandId?.('brand_override');
    });
    expect(contextValue.brandId).toBe('brand_override');

    useBrandMock.mockReturnValue({ brandId: 'brand_next' });
    rerender(
      <AnalyticsProvider syncWithBrandContext>
        <Consumer />
      </AnalyticsProvider>,
    );
    expect(contextValue.brandId).toBe('brand_next');
  });

  it('setDateRange updates state and notifies the change callback', () => {
    const onDateRangeChange = vi.fn();
    render(
      <AnalyticsProvider onDateRangeChange={onDateRangeChange}>
        <Consumer />
      </AnalyticsProvider>,
    );

    const range = {
      endDate: new Date('2026-06-30T00:00:00.000Z'),
      startDate: new Date('2026-06-01T00:00:00.000Z'),
    };
    act(() => {
      contextValue.setDateRange(range);
    });

    expect(contextValue.dateRange).toEqual(range);
    expect(onDateRangeChange).toHaveBeenCalledWith(range);
  });

  it('setFilter trims values, clears empty ones, and notifies the callback', () => {
    const onFilterChange = vi.fn();
    render(
      <AnalyticsProvider onFilterChange={onFilterChange}>
        <Consumer />
      </AnalyticsProvider>,
    );

    act(() => {
      contextValue.setFilter('platform', '  instagram  ');
    });
    expect(contextValue.filters).toEqual({ platform: 'instagram' });
    expect(onFilterChange).toHaveBeenCalledWith('platform', 'instagram');

    act(() => {
      contextValue.setFilter('platform', '   ');
    });
    expect(contextValue.filters).toEqual({});
    expect(onFilterChange).toHaveBeenLastCalledWith('platform', undefined);
  });

  it('triggerRefresh bumps the trigger and clears the refreshing flag after 1s', () => {
    vi.useFakeTimers();
    try {
      render(
        <AnalyticsProvider>
          <Consumer />
        </AnalyticsProvider>,
      );

      act(() => {
        contextValue.triggerRefresh();
      });
      expect(contextValue.isRefreshing).toBe(true);
      expect(contextValue.refreshTrigger).toBe(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(contextValue.isRefreshing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores a provided date range and filters', () => {
    const restoredDateRange = {
      endDate: new Date('2026-05-10T00:00:00.000Z'),
      startDate: new Date('2026-05-01T00:00:00.000Z'),
    };
    render(
      <AnalyticsProvider
        restoredDateRange={restoredDateRange}
        restoredFilters={{ platform: 'tiktok' }}
      >
        <Consumer />
      </AnalyticsProvider>,
    );

    expect(contextValue.dateRange.startDate?.getTime()).toBe(
      restoredDateRange.startDate.getTime(),
    );
    expect(contextValue.dateRange.endDate?.getTime()).toBe(
      restoredDateRange.endDate.getTime(),
    );
    expect(contextValue.filters).toEqual({ platform: 'tiktok' });
  });
});

describe('analytics hooks outside the provider', () => {
  it('useAnalyticsContext throws without AnalyticsProvider', () => {
    expect(() => renderHook(() => useAnalyticsContext())).toThrowError(
      /useAnalyticsContext must be used within AnalyticsProvider/,
    );
  });

  it('useOptionalAnalyticsContext returns undefined without AnalyticsProvider', () => {
    const { result } = renderHook(() => useOptionalAnalyticsContext());
    expect(result.current).toBeUndefined();
  });
});
