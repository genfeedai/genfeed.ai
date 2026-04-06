'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { AnalyticsContextType } from '@genfeedai/interfaces/analytics/analytics-context.interface';
import type { DateRange } from '@genfeedai/interfaces/utils/date.interface';
import type { LayoutProps } from '@props/layout/layout.props';
import { subDays } from 'date-fns';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(
  undefined,
);

interface AnalyticsProviderProps extends LayoutProps {
  syncWithBrandContext?: boolean;
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
  const [brandId, setBrandId] = useState<string | undefined>(undefined);

  const brandContext = useBrand();

  useEffect(() => {
    if (syncWithBrandContext && brandContext.brandId) {
      setBrandId(brandContext.brandId);
    }
  }, [syncWithBrandContext, brandContext.brandId]);

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  return (
    <AnalyticsContext.Provider
      value={{
        brandId,
        dateRange,
        isRefreshing,
        refreshTrigger,
        setBrandId,
        setDateRange,
        triggerRefresh,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error(
      'useAnalyticsContext must be used within AnalyticsProvider',
    );
  }
  return context;
}
