import {
  activityBulkPatchSerializerConfig,
  activitySerializerConfig,
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
  apiKeyFullSerializerConfig,
  apiKeySerializerConfig,
  type BuiltSerializer,
  buildSingleSerializer,
} from '..';

// Activity serializers
export const ActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  activitySerializerConfig,
);
export const ActivityBulkPatchSerializer: BuiltSerializer =
  buildSingleSerializer('client', activityBulkPatchSerializerConfig);

// API Key serializers
export const ApiKeySerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  apiKeySerializerConfig,
);
export const ApiKeyFullSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  apiKeyFullSerializerConfig,
);

// Analytics serializers
export const AnalyticsDeserializer: BuiltSerializer = buildSingleSerializer(
  'client',
  analyticsSerializerConfig,
);
export const AnalyticsTimeseriesDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsTimeSeriesSerializerConfig);
export const AnalyticsTimeseriesWithPlatformsDeserializer: BuiltSerializer =
  buildSingleSerializer(
    'client',
    analyticsTimeSeriesWithPlatformsSerializerConfig,
  );
export const AnalyticsPlatformDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsPlatformSerializerConfig);
export const AnalyticsTopContentDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsTopContentSerializerConfig);
export const AnalyticsOrgLeaderboardDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsOrgLeaderboardSerializerConfig);
export const AnalyticsBrandLeaderboardDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsBrandLeaderboardSerializerConfig);
export const AnalyticsOrgStatsDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsOrgStatsSerializerConfig);
export const AnalyticsBrandStatsDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsBrandStatsSerializerConfig);
export const AnalyticsOverviewDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsOverviewSerializerConfig);
export const AnalyticsGrowthDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsGrowthSerializerConfig);
export const AnalyticsEngagementDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsEngagementSerializerConfig);
export const AnalyticsHooksDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsHooksSerializerConfig);
export const AnalyticsTrendDeserializer: BuiltSerializer =
  buildSingleSerializer('client', analyticsTrendSerializerConfig);
