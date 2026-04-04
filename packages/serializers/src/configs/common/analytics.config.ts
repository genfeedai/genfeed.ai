import {
  analyticsAttributes,
  analyticsBrandLeaderboardAttributes,
  analyticsBrandStatsAttributes,
  analyticsEngagementAttributes,
  analyticsGrowthAttributes,
  analyticsHooksAttributes,
  analyticsOrgLeaderboardAttributes,
  analyticsOrgStatsAttributes,
  analyticsOverviewAttributes,
  analyticsPlatformAttributes,
  analyticsTimeSeriesAttributes,
  analyticsTimeSeriesWithPlatformsAttributes,
  analyticsTopContentAttributes,
  analyticsTrendAttributes,
} from '@serializers/attributes/common';
import { simpleConfig } from '@serializers/builders';

export const analyticsSerializerConfig = simpleConfig(
  'analytic',
  analyticsAttributes,
);

export const analyticsTimeSeriesSerializerConfig = simpleConfig(
  'analytics-timeseries',
  analyticsTimeSeriesAttributes,
);

export const analyticsTimeSeriesWithPlatformsSerializerConfig = simpleConfig(
  'analytics-timeseries-with-platforms',
  analyticsTimeSeriesWithPlatformsAttributes,
);

export const analyticsPlatformSerializerConfig = simpleConfig(
  'analytics-platform',
  analyticsPlatformAttributes,
);

export const analyticsTopContentSerializerConfig = simpleConfig(
  'analytics-top-content',
  analyticsTopContentAttributes,
);

export const analyticsOrgLeaderboardSerializerConfig = simpleConfig(
  'analytics-org-leaderboard',
  analyticsOrgLeaderboardAttributes,
);

export const analyticsBrandLeaderboardSerializerConfig = simpleConfig(
  'analytics-brand-leaderboard',
  analyticsBrandLeaderboardAttributes,
);

export const analyticsOrgStatsSerializerConfig = simpleConfig(
  'analytics-org-stats',
  analyticsOrgStatsAttributes,
);

export const analyticsBrandStatsSerializerConfig = simpleConfig(
  'analytics-brand-stats',
  analyticsBrandStatsAttributes,
);

export const analyticsOverviewSerializerConfig = simpleConfig(
  'analytics-overview',
  analyticsOverviewAttributes,
);

export const analyticsGrowthSerializerConfig = simpleConfig(
  'analytics-growth',
  analyticsGrowthAttributes,
);

export const analyticsEngagementSerializerConfig = simpleConfig(
  'analytics-engagement',
  analyticsEngagementAttributes,
);

export const analyticsHooksSerializerConfig = simpleConfig(
  'analytics-hooks',
  analyticsHooksAttributes,
);

export const analyticsTrendSerializerConfig = simpleConfig(
  'analytics-trend',
  analyticsTrendAttributes,
);
