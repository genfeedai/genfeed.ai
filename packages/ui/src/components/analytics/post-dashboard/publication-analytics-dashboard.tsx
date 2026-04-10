'use client';

import { useAuth } from '@clerk/nextjs';
import { formatDate } from '@genfeedai/helpers/formatting/date/date.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@genfeedai/hooks/data/resource/use-resource/use-resource';
import type { IPostAnalyticsSummary } from '@genfeedai/interfaces';
import type { PostAnalyticsDashboardProps } from '@genfeedai/props/analytics/analytics.props';
import { PostAnalyticsService } from '@genfeedai/services/analytics/publication-analytics.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { getErrorStatus } from '@genfeedai/utils/error/error-handler.util';
import AnalyticsOverview from '@ui/analytics/overview/analytics-overview';
import PlatformAnalyticsBreakdown from '@ui/analytics/platform-breakdown/platform-analytics-breakdown';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Loading from '@ui/loading/default/Loading';
import { useCallback, useMemo, useState } from 'react';

export default function PostAnalyticsDashboard({
  publicationId,
  className = '',
}: PostAnalyticsDashboardProps) {
  const { isSignedIn } = useAuth();
  const getPostAnalyticsService = useAuthedService(
    useCallback((token: string) => PostAnalyticsService.getInstance(token), []),
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  // Load analytics using useResource (handles AbortController cleanup properly)
  const {
    data: analyticsData,
    isLoading,
    refresh: refreshAnalytics,
    mutate: setAnalytics,
  } = useResource(
    async () => {
      if (!publicationId) {
        return null;
      }
      const service = await getPostAnalyticsService();
      const data = await service.getPostAnalytics(publicationId);
      return data.summary;
    },
    {
      dependencies: [publicationId],
      enabled: !!isSignedIn && !!publicationId,
      onError: () => {
        notificationsService.error('Failed to load analytics');
      },
    },
  );

  const analytics: IPostAnalyticsSummary | null = analyticsData ?? null;

  const handleRefresh = useCallback(async () => {
    if (!publicationId || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      const service = await getPostAnalyticsService();
      const data = await service.postAnalytics(publicationId);

      setAnalytics(data.summary);
      setLastRefreshed(new Date(data.lastRefreshed));
      notificationsService.success('Analytics refreshed successfully');
      setIsRefreshing(false);
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 429) {
        notificationsService.error(
          'Rate limit reached. Please try again later',
        );
      } else {
        notificationsService.error('Failed to refresh analytics');
      }
      setIsRefreshing(false);
    }
  }, [
    publicationId,
    isRefreshing,
    getPostAnalyticsService,
    notificationsService,
    setAnalytics,
  ]);

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const service = await getPostAnalyticsService();
      const data = await service.postAllAnalytics();

      notificationsService.success(
        `Refreshed ${data.successCount} of ${data.totalPosts} posts`,
      );

      // Refresh current publication analytics
      if (publicationId) {
        await refreshAnalytics();
      }
      setIsRefreshing(false);
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 429) {
        notificationsService.error(
          'Rate limit reached. Please try again later',
        );
      } else {
        notificationsService.error('Failed to refresh all analytics');
      }
      setIsRefreshing(false);
    }
  }, [
    publicationId,
    getPostAnalyticsService,
    notificationsService,
    refreshAnalytics,
  ]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!analytics) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  // Convert single analytics summary to array format expected by components
  const analyticsArray = [
    {
      summary: {
        avgEngagementRate: analytics.avgEngagementRate,
        totalComments: analytics.totalComments,
        totalLikes: analytics.totalLikes,
        totalShares: analytics.totalShares,
        totalViews: analytics.totalViews,
      },
    },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with refresh buttons */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Post Analytics</h2>
        <div className="flex gap-2">
          {publicationId && (
            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          )}

          <ButtonRefresh
            onClick={handleRefreshAll}
            isRefreshing={isRefreshing}
          />
        </div>
      </div>

      {lastRefreshed && (
        <p className="text-sm text-muted-foreground">
          Last refreshed: {formatDate(lastRefreshed)}
        </p>
      )}

      {/* Summary Cards */}
      <AnalyticsOverview
        analytics={analyticsArray}
        showPostsCount={false}
        isLoading={false}
      />

      {/* Platform Breakdown - Only show if we have platform data */}
      {publicationId &&
        analytics.platforms &&
        Object.keys(analytics.platforms).length > 0 && (
          <PlatformAnalyticsBreakdown
            analytics={Object.entries(analytics.platforms).map(
              ([platform, stats]) => ({
                id: publicationId,
                label: '',
                platform,
                summary: {
                  avgEngagementRate: stats.engagementRate,
                  publicationCount: 1,
                  totalComments: stats.totalComments,
                  totalLikes: stats.totalLikes,
                  totalShares: stats.totalShares,
                  totalViews: stats.totalViews,
                },
              }),
            )}
          />
        )}
    </div>
  );
}
