'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  AnalyticsQueryFilterKey,
  AnalyticsQueryFilters,
} from '@genfeedai/interfaces';
import type { AnalyticsContextType } from '@genfeedai/interfaces/analytics/analytics-context.interface';
import type { DateRange } from '@genfeedai/interfaces/utils/date.interface';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { subDays } from 'date-fns';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(
  undefined,
);

interface AnalyticsProviderProps extends LayoutProps {
  onDateRangeChange?: (range: DateRange) => void;
  onFilterChange?: (key: AnalyticsQueryFilterKey, value?: string) => void;
  restoredDateRange?: DateRange;
  restoredFilters?: AnalyticsQueryFilters;
  syncWithBrandContext?: boolean;
}

interface BrandIdOverride {
  contextBrandId: string | undefined;
  value: string | undefined;
}

export function AnalyticsProvider({
  children,
  onDateRangeChange,
  onFilterChange,
  restoredDateRange,
  restoredFilters,
  syncWithBrandContext = false,
}: AnalyticsProviderProps) {
  const yesterday = subDays(new Date(), 1);

  const [dateRange, setDateRangeState] = useState<DateRange>(
    () =>
      restoredDateRange ?? {
        endDate: yesterday,
        startDate: subDays(yesterday, 6),
      },
  );
  const [filters, setFilters] = useState<AnalyticsQueryFilters>(
    () => restoredFilters ?? {},
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const brandContext = useBrand();
  const contextBrandId = syncWithBrandContext
    ? brandContext.brandId
    : undefined;
  const [brandIdOverride, setBrandIdOverride] =
    useState<BrandIdOverride | null>(null);
  const brandId =
    brandIdOverride && brandIdOverride.contextBrandId === contextBrandId
      ? brandIdOverride.value
      : contextBrandId;

  const setBrandId = useCallback(
    (value: string | undefined) => {
      setBrandIdOverride({ contextBrandId, value });
    },
    [contextBrandId],
  );

  const restoredStartTime = restoredDateRange?.startDate
    ? new Date(restoredDateRange.startDate).getTime()
    : null;
  const restoredEndTime = restoredDateRange?.endDate
    ? new Date(restoredDateRange.endDate).getTime()
    : null;
  const restoredFiltersKey = JSON.stringify(restoredFilters ?? {});

  useEffect(() => {
    if (restoredStartTime === null || restoredEndTime === null) {
      return;
    }
    setDateRangeState({
      endDate: new Date(restoredEndTime),
      startDate: new Date(restoredStartTime),
    });
  }, [restoredEndTime, restoredStartTime]);

  useEffect(() => {
    setFilters(JSON.parse(restoredFiltersKey) as AnalyticsQueryFilters);
  }, [restoredFiltersKey]);

  const setDateRange = useCallback(
    (range: DateRange) => {
      setDateRangeState(range);
      onDateRangeChange?.(range);
    },
    [onDateRangeChange],
  );

  const setFilter = useCallback(
    (key: AnalyticsQueryFilterKey, value?: string) => {
      setFilters((current) => {
        const next = { ...current };
        if (value?.trim()) {
          next[key] = value.trim();
        } else {
          delete next[key];
        }
        return next;
      });
      onFilterChange?.(key, value?.trim() || undefined);
    },
    [onFilterChange],
  );

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  const contextValue = useMemo(
    () => ({
      brandId,
      dateRange,
      filters,
      isRefreshing,
      refreshTrigger,
      setBrandId,
      setDateRange,
      setFilter,
      triggerRefresh,
    }),
    [
      brandId,
      dateRange,
      filters,
      isRefreshing,
      refreshTrigger,
      triggerRefresh,
      setBrandId,
      setDateRange,
      setFilter,
    ],
  );

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = use(AnalyticsContext);
  if (!context) {
    throw new Error(
      'useAnalyticsContext must be used within AnalyticsProvider',
    );
  }
  return context;
}

export function useOptionalAnalyticsContext():
  | AnalyticsContextType
  | undefined {
  return use(AnalyticsContext);
}
