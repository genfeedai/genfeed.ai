import 'server-only';

import {
  getServerAuthToken,
  hasUsableServerAuthToken,
} from '@app-server/protected-bootstrap.server';
import { AnalyticsMetric, PageScope } from '@genfeedai/enums';
import type {
  IAnalytics,
  ITimeSeriesApiDataPoint,
} from '@genfeedai/interfaces';
import { getDefaultDateRange } from '@helpers/utils/date-range.util';
import type { TopPostData } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import {
  AnalyticsService,
  type IBrandWithStats,
  type IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { cache } from 'react';

export interface AnalyticsOverviewPageData {
  analytics: Partial<IAnalytics>;
  brandsLeaderboard: IBrandWithStats[];
  cachedAt: string;
  orgsLeaderboard: IOrgLeaderboardItem[];
  timeseriesData: PlatformTimeSeriesDataPoint[];
  topPosts: TopPostData[];
}

const DEFAULT_ANALYTICS: Partial<IAnalytics> = {
  activePlatforms: [],
  avgEngagementRate: 0,
  engagementGrowth: 0,
  monthlyGrowth: 0,
  totalBrands: 0,
  totalCredentialsConnected: 0,
  totalEngagement: 0,
  totalPosts: 0,
  totalSubscriptions: 0,
  totalUsers: 0,
  totalViews: 0,
  viewsGrowth: 0,
};

function transformTimeSeriesData(data: unknown): PlatformTimeSeriesDataPoint[] {
  const dataArray = Array.isArray(data) ? data : [];

  return (dataArray as ITimeSeriesApiDataPoint[]).map((item) => ({
    date: item.date,
    facebook: item.facebook?.views ?? 0,
    instagram: item.instagram?.views ?? 0,
    linkedin: item.linkedin?.views ?? 0,
    medium: item.medium?.views ?? 0,
    pinterest: item.pinterest?.views ?? 0,
    reddit: item.reddit?.views ?? 0,
    tiktok: item.tiktok?.views ?? 0,
    twitter: item.twitter?.views ?? 0,
    youtube: item.youtube?.views ?? 0,
  }));
}

export const loadAnalyticsOverviewPageData = cache(
  async (scope: PageScope): Promise<AnalyticsOverviewPageData> => {
    const token = await getServerAuthToken();

    if (!hasUsableServerAuthToken(token)) {
      return {
        analytics: DEFAULT_ANALYTICS,
        brandsLeaderboard: [],
        cachedAt: new Date().toISOString(),
        orgsLeaderboard: [],
        timeseriesData: [],
        topPosts: [],
      };
    }

    const analyticsService = AnalyticsService.getInstance(token);
    const { startDate: startDateKey, endDate: endDateKey } =
      getDefaultDateRange();

    const query = {
      endDate: endDateKey,
      startDate: startDateKey,
    };

    const [analytics, leaderboardData, timeseriesData, topPosts] =
      await Promise.all([
        analyticsService.findAll(query).catch((error) => {
          logger.error('Failed to load initial analytics overview', error);
          return DEFAULT_ANALYTICS;
        }),
        Promise.all([
          scope === PageScope.SUPERADMIN
            ? analyticsService
                .getOrganizationsLeaderboard({
                  ...query,
                  limit: 5,
                  sort: AnalyticsMetric.ENGAGEMENT,
                })
                .catch((error) => {
                  logger.error(
                    'Failed to load initial organization leaderboards',
                    error,
                  );
                  return [];
                })
            : Promise.resolve([]),
          analyticsService
            .getBrandsLeaderboard({
              ...query,
              limit: 5,
              sort: AnalyticsMetric.ENGAGEMENT,
            })
            .catch((error) => {
              logger.error('Failed to load initial brand leaderboards', error);
              return [];
            }),
        ]),
        analyticsService.getTimeSeries(query).catch((error) => {
          logger.error('Failed to load initial analytics time series', error);
          return [];
        }),
        analyticsService
          .getTopContent({
            endDate: endDateKey,
            limit: 10,
            metric: AnalyticsMetric.VIEWS,
            startDate: startDateKey,
          })
          .catch((error) => {
            logger.error('Failed to load initial top posts', error);
            return [];
          }),
      ]);

    return {
      analytics,
      brandsLeaderboard: leaderboardData[1],
      cachedAt: new Date().toISOString(),
      orgsLeaderboard: leaderboardData[0],
      timeseriesData: transformTimeSeriesData(timeseriesData),
      topPosts: topPosts as TopPostData[],
    };
  },
);
