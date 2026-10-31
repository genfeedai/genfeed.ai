import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import type { IWinnerPost } from '@genfeedai/contracts/interfaces';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
import { getDateRangeKeys } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export interface UseWinnerPostsOptions {
  brandId?: string;
  isEnabled?: boolean;
  limit?: number;
  platform?: string;
}

/**
 * #5502 own posts published in the analytics range that beat their account
 * baseline on any signal (`GET /analytics/winners`), strongest first.
 */
export function useWinnerPosts(options: UseWinnerPostsOptions = {}) {
  const { brandId, isEnabled = true, limit = 50, platform } = options;
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const { endDateKey, startDateKey } = useMemo(
    () => getDateRangeKeys(dateRange),
    [dateRange],
  );

  const { data, error, isLoading, refetch } = useQuery({
    enabled: isEnabled && Boolean(startDateKey && endDateKey),
    queryFn: async (): Promise<IWinnerPost[]> => {
      const service = await getAnalyticsService();
      return await service.getWinners({
        endDate: endDateKey,
        limit,
        startDate: startDateKey,
        ...(brandId && { brandId }),
        ...(platform && { platform }),
      });
    },
    queryKey: [
      'analytics-winners',
      startDateKey,
      endDateKey,
      limit,
      brandId,
      platform,
      refreshTrigger,
    ],
  });

  return {
    error,
    isLoading: isEnabled && isLoading,
    refetch,
    winners: data ?? [],
  };
}
