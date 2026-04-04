import { buildSerializer } from '@serializers/builders';
import {
  analyticsBrandLeaderboardSerializerConfig,
  analyticsBrandStatsSerializerConfig,
  analyticsEngagementSerializerConfig,
  analyticsGrowthSerializerConfig,
  analyticsHooksSerializerConfig,
  analyticsOrgLeaderboardSerializerConfig,
  analyticsOrgStatsSerializerConfig,
  analyticsOverviewSerializerConfig,
  analyticsPlatformSerializerConfig,
  analyticsSerializerConfig,
  analyticsTimeSeriesSerializerConfig,
  analyticsTimeSeriesWithPlatformsSerializerConfig,
  analyticsTopContentSerializerConfig,
  analyticsTrendSerializerConfig,
} from '@serializers/configs';

export const { AnalyticSerializer } = buildSerializer(
  'server',
  analyticsSerializerConfig,
);

export const { AnalyticsBrandLeaderboardSerializer } = buildSerializer(
  'server',
  analyticsBrandLeaderboardSerializerConfig,
);

export const { AnalyticsBrandStatsSerializer } = buildSerializer(
  'server',
  analyticsBrandStatsSerializerConfig,
);

export const { AnalyticsEngagementSerializer } = buildSerializer(
  'server',
  analyticsEngagementSerializerConfig,
);

export const { AnalyticsGrowthSerializer } = buildSerializer(
  'server',
  analyticsGrowthSerializerConfig,
);

export const { AnalyticsHooksSerializer } = buildSerializer(
  'server',
  analyticsHooksSerializerConfig,
);

export const { AnalyticsOrgLeaderboardSerializer } = buildSerializer(
  'server',
  analyticsOrgLeaderboardSerializerConfig,
);

export const { AnalyticsOrgStatsSerializer } = buildSerializer(
  'server',
  analyticsOrgStatsSerializerConfig,
);

export const { AnalyticsOverviewSerializer } = buildSerializer(
  'server',
  analyticsOverviewSerializerConfig,
);

export const { AnalyticsPlatformSerializer } = buildSerializer(
  'server',
  analyticsPlatformSerializerConfig,
);

export const { AnalyticsTimeseriesSerializer } = buildSerializer(
  'server',
  analyticsTimeSeriesSerializerConfig,
);

export const { AnalyticsTimeseriesWithPlatformsSerializer } = buildSerializer(
  'server',
  analyticsTimeSeriesWithPlatformsSerializerConfig,
);

export const { AnalyticsTopContentSerializer } = buildSerializer(
  'server',
  analyticsTopContentSerializerConfig,
);

export const { AnalyticsTrendSerializer } = buildSerializer(
  'server',
  analyticsTrendSerializerConfig,
);
