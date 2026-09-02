'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric, PageScope } from '@genfeedai/contracts';
import type {
  DashboardPresetData,
  ITimeSeriesApiDataPoint,
} from '@genfeedai/contracts/interfaces';
import { getDateRangeKeys } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import { useLeaderboards } from '@hooks/data/analytics/use-leaderboards/use-leaderboards';
import {
  type TopPostData,
  useTopPosts,
} from '@hooks/data/analytics/use-top-posts/use-top-posts';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(
  source: Record<string, unknown>,
  key: string,
): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toDashboardRows(
  rows: readonly object[],
): Array<Record<string, unknown>> {
  return rows.map((row) => Object.fromEntries(Object.entries(row)));
}

const TIME_SERIES_PLATFORM_KEYS = [
  'facebook',
  'instagram',
  'linkedin',
  'medium',
  'pinterest',
  'reddit',
  'tiktok',
  'twitter',
  'youtube',
] as const satisfies ReadonlyArray<keyof ITimeSeriesApiDataPoint>;

export function normalizeTimeSeries(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row) => {
    if (!isRecord(row) || typeof row.date !== 'string') {
      return [];
    }

    const platformMetrics = TIME_SERIES_PLATFORM_KEYS.flatMap((platform) => {
      const metrics = row[platform];
      return isRecord(metrics) ? [{ metrics, platform }] : [];
    });
    const views = platformMetrics.reduce(
      (total, { metrics }) => total + readFiniteNumber(metrics, 'views'),
      0,
    );
    const totalEngagement = platformMetrics.reduce(
      (total, { metrics }) =>
        total +
        readFiniteNumber(metrics, 'likes') +
        readFiniteNumber(metrics, 'comments') +
        readFiniteNumber(metrics, 'shares') +
        readFiniteNumber(metrics, 'saves'),
      0,
    );

    return [
      {
        date: row.date,
        engagementRate: views > 0 ? (totalEngagement / views) * 100 : 0,
        totalEngagement,
        views,
        ...Object.fromEntries(
          platformMetrics.map(({ metrics, platform }) => [
            platform,
            readFiniteNumber(metrics, 'views'),
          ]),
        ),
      },
    ];
  });
}

export function normalizePlatformComparison(
  value: unknown,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = Array.isArray(value)
    ? value.filter(isRecord)
    : isRecord(value)
      ? Object.entries(value).flatMap(([platform, metrics]) =>
          isRecord(metrics) ? [{ ...metrics, platform }] : [],
        )
      : [];

  return rows.map((row) => ({
    ...row,
    engagement: row.engagement ?? row.totalEngagement ?? 0,
    posts: row.posts ?? row.totalPosts ?? 0,
    views: row.views ?? row.totalViews ?? 0,
  }));
}

export function normalizeTopPosts(
  posts: readonly TopPostData[],
): Array<Record<string, unknown>> {
  return posts.map((post) => ({
    engagement: post.totalEngagement,
    id: post.postId,
    platform: post.platform,
    ...(post.label || post.description
      ? { title: post.label ?? post.description }
      : {}),
    ...(post.thumbnailUrl ? { thumbnail: post.thumbnailUrl } : {}),
    views: post.totalViews,
  }));
}

export function useWorkspaceDashboardData(brandId: string) {
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const { endDateKey, startDateKey } = useMemo(
    () => getDateRangeKeys(dateRange),
    [dateRange],
  );
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const { analytics, isLoading: isAnalyticsLoading } = useAnalytics({
    autoLoad: true,
    endDate: endDateKey ?? undefined,
    scope: PageScope.BRAND,
    scopeId: brandId,
    startDate: startDateKey ?? undefined,
  });
  const { brandsLeaderboard, isLeaderboardLoading, orgsLeaderboard } =
    useLeaderboards({
      dateRange,
      refreshTrigger,
      scope: PageScope.BRAND,
    });
  const { isLoading: isTopPostsLoading, topPosts } = useTopPosts({
    brandId,
    limit: 10,
    metric: AnalyticsMetric.VIEWS,
  });
  const { data: platformComparisonData = [], isLoading: isPlatformLoading } =
    useQuery<Array<Record<string, unknown>>>({
      enabled: Boolean(brandId && startDateKey && endDateKey),
      queryFn: async () => {
        const service = await getAnalyticsService();
        const value = await service.getPlatformComparison({
          brand: brandId,
          endDate: endDateKey ?? undefined,
          startDate: startDateKey ?? undefined,
        });
        return normalizePlatformComparison(value);
      },
      queryKey: [
        'dashboard-layout-platform-comparison',
        brandId,
        startDateKey,
        endDateKey,
        refreshTrigger,
      ],
    });
  const { data: timeSeriesData = [], isLoading: isTimeseriesLoading } =
    useQuery<Array<Record<string, unknown>>>({
      enabled: Boolean(brandId && startDateKey && endDateKey),
      queryFn: async () => {
        const service = await getAnalyticsService();
        const value = await service.getTimeSeries({
          brand: brandId,
          endDate: endDateKey ?? undefined,
          startDate: startDateKey ?? undefined,
        });
        return normalizeTimeSeries(value);
      },
      queryKey: [
        'dashboard-layout-timeseries',
        brandId,
        startDateKey,
        endDateKey,
        refreshTrigger,
      ],
    });

  const bundle = useMemo<DashboardPresetData>(
    () => ({
      analytics,
      brandLeaderboard: toDashboardRows(brandsLeaderboard),
      organizationLeaderboard: toDashboardRows(orgsLeaderboard),
      platformComparisonData,
      timeSeriesData,
      topPosts: normalizeTopPosts(topPosts),
    }),
    [
      analytics,
      brandsLeaderboard,
      orgsLeaderboard,
      platformComparisonData,
      timeSeriesData,
      topPosts,
    ],
  );

  return {
    bundle,
    isLoading:
      isAnalyticsLoading ||
      isLeaderboardLoading ||
      isPlatformLoading ||
      isTimeseriesLoading ||
      isTopPostsLoading,
  };
}
