import type { TrendSourceMetrics } from '@api/collections/trends/interfaces/trend.interfaces';

const ENGAGEMENT_METRIC_KEYS = [
  'comments',
  'likes',
  'shares',
  'views',
] as const;

function metricValue(value?: number): number {
  return value || 0;
}

export function getTrendEngagementTotal(metrics?: TrendSourceMetrics): number {
  if (!metrics) {
    return 0;
  }

  return ENGAGEMENT_METRIC_KEYS.reduce(
    (total, key) => total + metricValue(metrics[key]),
    0,
  );
}
