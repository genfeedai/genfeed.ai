import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
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
} from '../../configs';

export const AnalyticSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  analyticsSerializerConfig,
);

export const AnalyticsBrandLeaderboardSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsBrandLeaderboardSerializerConfig);

export const AnalyticsBrandStatsSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsBrandStatsSerializerConfig);

export const AnalyticsEngagementSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsEngagementSerializerConfig);

export const AnalyticsGrowthSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  analyticsGrowthSerializerConfig,
);

export const AnalyticsHooksSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  analyticsHooksSerializerConfig,
);

export const AnalyticsOrgLeaderboardSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsOrgLeaderboardSerializerConfig);

export const AnalyticsOrgStatsSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsOrgStatsSerializerConfig);

export const AnalyticsOverviewSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsOverviewSerializerConfig);

export const AnalyticsPlatformSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsPlatformSerializerConfig);

export const AnalyticsTimeseriesSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsTimeSeriesSerializerConfig);

export const AnalyticsTimeseriesWithPlatformsSerializer: BuiltSerializer =
  buildSingleSerializer(
    'server',
    analyticsTimeSeriesWithPlatformsSerializerConfig,
  );

export const AnalyticsTopContentSerializer: BuiltSerializer =
  buildSingleSerializer('server', analyticsTopContentSerializerConfig);

export const AnalyticsTrendSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  analyticsTrendSerializerConfig,
);
