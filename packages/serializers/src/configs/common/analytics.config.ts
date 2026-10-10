import {
  accountAnalyticsDetailAttributes,
  accountAnalyticsListAttributes,
  accountAnalyticsTopAttributes,
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
  analyticsTimeSeriesWithPlatformsAttributes,
  analyticsTopContentAttributes,
  analyticsTopPostAttributes,
  analyticsTrendAttributes,
  analyticsWinnerPostAttributes,
  fleetEvaluationPolicyAttributes,
} from '@serializers/attributes/common';
import { simpleConfig } from '@serializers/builders';

export const analyticsSerializerConfig = simpleConfig(
  'analytic',
  analyticsAttributes,
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

/**
 * `GET /analytics/top` — distinct from `analyticsTopContentSerializerConfig`,
 * which serializes the unrelated organizations-relationships top-content
 * endpoint. See `analyticsTopPostAttributes` for why these can't share one
 * serializer.
 */
export const analyticsTopPostSerializerConfig = simpleConfig(
  'analytics-top-post',
  analyticsTopPostAttributes,
);

/** #5502 `GET /analytics/winners`. */
export const analyticsWinnerPostSerializerConfig = simpleConfig(
  'analytics-winner-post',
  analyticsWinnerPostAttributes,
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

export const accountAnalyticsListSerializerConfig = simpleConfig(
  'account-analytics-list',
  accountAnalyticsListAttributes,
);

export const accountAnalyticsTopSerializerConfig = simpleConfig(
  'account-analytics-top',
  accountAnalyticsTopAttributes,
);

export const accountAnalyticsDetailSerializerConfig = simpleConfig(
  'account-analytics-detail',
  accountAnalyticsDetailAttributes,
);

export const fleetEvaluationPolicySerializerConfig = simpleConfig(
  'fleet-evaluation-policy',
  fleetEvaluationPolicyAttributes,
);
