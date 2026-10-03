import type { AnalyticsQueryMetric } from '@genfeedai/contracts/interfaces';

const DEFINITION_KEYS = Object.freeze({
  comments: 'metricDefinitions.comments',
  engagement: 'metricDefinitions.engagement',
  engagementRate: 'metricDefinitions.engagementRate',
  likes: 'metricDefinitions.likes',
  posts: 'metricDefinitions.posts',
  saves: 'metricDefinitions.saves',
  shares: 'metricDefinitions.shares',
  views: 'metricDefinitions.views',
} as const satisfies Record<
  AnalyticsQueryMetric,
  `metricDefinitions.${AnalyticsQueryMetric}`
>);

/** Accept canonical IDs only, including at dynamic API/URL boundaries. */
export function getAnalyticsMetricDefinitionKey(
  metric: unknown,
): `metricDefinitions.${AnalyticsQueryMetric}` | undefined {
  return typeof metric === 'string' && Object.hasOwn(DEFINITION_KEYS, metric)
    ? DEFINITION_KEYS[metric as AnalyticsQueryMetric]
    : undefined;
}
