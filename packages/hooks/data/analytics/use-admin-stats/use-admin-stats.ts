import { AnalyticsMetric } from '@genfeedai/contracts';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import type { IOrgLeaderboardItem } from '@genfeedai/services/analytics/analytics.service';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export interface ITimeSeriesDataPoint {
  date: string;
  posts: number;
  users: number;
  credits: number;
}

export interface UseAdminStatsReturn {
  stats: IAnalytics | null;
  leaderboard: IOrgLeaderboardItem[];
  timeseries: ITimeSeriesDataPoint[];
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

export function useAdminStats(): UseAdminStatsReturn {
  const { isLoaded, isSignedIn, orgId, sessionId, userId } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsLoaded = isLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const effectiveOrgId = orgId ?? playwrightAuth?.orgId ?? null;
  const shouldFetch =
    effectiveIsLoaded && effectiveIsSignedIn && !!effectiveUserId;
  const queryOwner = [
    effectiveUserId,
    sessionId ?? null,
    effectiveOrgId,
    EnvironmentService.apiEndpoint,
    shouldFetch,
  ];
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const {
    data: statsData,
    isLoading: isLoadingStats,
    isFetching: isFetchingStats,
    refetch: refetchStats,
  } = useQuery({
    enabled: shouldFetch,
    queryKey: ['admin-stats', ...queryOwner],
    queryFn: async ({ signal }) => {
      if (!shouldFetch) return null;
      signal.throwIfAborted();
      const service = await getAnalyticsService();
      signal.throwIfAborted();
      const result = await service.findAll();
      signal.throwIfAborted();
      return result;
    },
  });

  const {
    data: leaderboardData,
    isLoading: isLoadingLeaderboard,
    isFetching: isFetchingLeaderboard,
    refetch: refetchLeaderboard,
  } = useQuery({
    enabled: shouldFetch,
    queryKey: ['admin-leaderboard', ...queryOwner],
    queryFn: async ({ signal }) => {
      if (!shouldFetch) return [];
      signal.throwIfAborted();
      const service = await getAnalyticsService();
      signal.throwIfAborted();
      const result = await service.getOrganizationsLeaderboard({
        limit: 5,
        sort: AnalyticsMetric.POSTS,
      });
      signal.throwIfAborted();
      return result;
    },
  });

  const {
    data: timeseriesData,
    isLoading: isLoadingTimeseries,
    isFetching: isFetchingTimeseries,
    refetch: refetchTimeseries,
  } = useQuery({
    enabled: shouldFetch,
    queryKey: ['admin-timeseries', ...queryOwner],
    queryFn: async ({ signal }) => {
      if (!shouldFetch) return [];
      signal.throwIfAborted();
      const service = await getAnalyticsService();
      signal.throwIfAborted();
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const result = await service.getTimeSeries({
        endDate: endDate.toISOString().split('T')[0],
        startDate: startDate.toISOString().split('T')[0],
      });
      signal.throwIfAborted();
      return result;
    },
  });

  const stats = useMemo(
    () =>
      shouldFetch
        ? ((statsData as IAnalytics | null | undefined) ?? null)
        : null,
    [shouldFetch, statsData],
  );

  const leaderboard = useMemo(
    () =>
      shouldFetch ? ((leaderboardData as IOrgLeaderboardItem[]) ?? []) : [],
    [leaderboardData, shouldFetch],
  );

  const timeseries = useMemo(() => {
    if (!shouldFetch || !timeseriesData || !Array.isArray(timeseriesData)) {
      return [];
    }

    return (timeseriesData as Array<Record<string, unknown>>).map((item) => {
      const platforms = [
        'youtube',
        'tiktok',
        'instagram',
        'twitter',
        'pinterest',
        'facebook',
        'linkedin',
      ];
      let totalViews = 0;
      let totalLikes = 0;

      platforms.forEach((platform) => {
        const platformData = item[platform] as
          | { views?: number; likes?: number }
          | undefined;
        if (platformData) {
          totalViews += platformData.views || 0;
          totalLikes += platformData.likes || 0;
        }
      });

      return {
        credits: totalLikes,
        date: item.date as string,
        posts: totalViews,
        users: totalLikes,
      };
    });
  }, [shouldFetch, timeseriesData]);

  const isLoading =
    shouldFetch &&
    (isLoadingStats || isLoadingLeaderboard || isLoadingTimeseries);
  const isRefreshing =
    shouldFetch &&
    ((isFetchingStats && !isLoadingStats) ||
      (isFetchingLeaderboard && !isLoadingLeaderboard) ||
      (isFetchingTimeseries && !isLoadingTimeseries));

  const refresh = async () => {
    if (!shouldFetch) return;
    await Promise.all([
      refetchStats(),
      refetchLeaderboard(),
      refetchTimeseries(),
    ]);
  };

  return {
    isLoading,
    isRefreshing,
    leaderboard,
    refresh,
    stats,
    timeseries,
  };
}
