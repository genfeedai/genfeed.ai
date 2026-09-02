import { AnalyticsMetric } from '@genfeedai/contracts';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import type { IOrgLeaderboardItem } from '@genfeedai/services/analytics/analytics.service';
import { AnalyticsService } from '@genfeedai/services/analytics/analytics.service';
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
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const {
    data: statsData,
    isLoading: isLoadingStats,
    isFetching: isFetchingStats,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const service = await getAnalyticsService();
      return await service.findAll();
    },
  });

  const {
    data: leaderboardData,
    isLoading: isLoadingLeaderboard,
    isFetching: isFetchingLeaderboard,
    refetch: refetchLeaderboard,
  } = useQuery({
    queryKey: ['admin-leaderboard'],
    queryFn: async () => {
      const service = await getAnalyticsService();
      return await service.getOrganizationsLeaderboard({
        limit: 5,
        sort: AnalyticsMetric.POSTS,
      });
    },
  });

  const {
    data: timeseriesData,
    isLoading: isLoadingTimeseries,
    isFetching: isFetchingTimeseries,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: ['admin-timeseries'],
    queryFn: async () => {
      const service = await getAnalyticsService();
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      return await service.getTimeSeries({
        endDate: endDate.toISOString().split('T')[0],
        startDate: startDate.toISOString().split('T')[0],
      });
    },
  });

  const stats = useMemo(
    () => (statsData as IAnalytics | null | undefined) ?? null,
    [statsData],
  );

  const leaderboard = useMemo(
    () => (leaderboardData as IOrgLeaderboardItem[]) ?? [],
    [leaderboardData],
  );

  const timeseries = useMemo(() => {
    if (!timeseriesData || !Array.isArray(timeseriesData)) {
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
  }, [timeseriesData]);

  const isLoading =
    isLoadingStats || isLoadingLeaderboard || isLoadingTimeseries;
  const isRefreshing =
    (isFetchingStats && !isLoadingStats) ||
    (isFetchingLeaderboard && !isLoadingLeaderboard) ||
    (isFetchingTimeseries && !isLoadingTimeseries);

  const refresh = async () => {
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
