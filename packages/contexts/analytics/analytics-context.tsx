'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { AnalyticsContextType } from '@genfeedai/interfaces/analytics/analytics-context.interface';
import type { DateRange } from '@genfeedai/interfaces/utils/date.interface';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { subDays } from 'date-fns';
import { createContext, use, useCallback, useMemo, useState } from 'react';

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(
  undefined,
);

interface AnalyticsProviderProps extends LayoutProps {
  syncWithBrandContext?: boolean;
}

interface BrandIdOverride {
  contextBrandId: string | undefined;
  value: string | undefined;
}

export function AnalyticsProvider({
  children,
  syncWithBrandContext = false,
}: AnalyticsProviderProps) {
  const yesterday = subDays(new Date(), 1);

  const [dateRange, setDateRange] = useState<DateRange>({
    endDate: yesterday,
    startDate: subDays(yesterday, 6),
  });
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

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  const contextValue = useMemo(
    () => ({
      brandId,
      dateRange,
      isRefreshing,
      refreshTrigger,
      setBrandId,
      setDateRange,
      triggerRefresh,
    }),
    [
      brandId,
      dateRange,
      isRefreshing,
      refreshTrigger,
      triggerRefresh,
      setBrandId,
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
