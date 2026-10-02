import { describe, expect, it } from 'vitest';
import { getAnalyticsMetricDefinitionKey } from './analytics-metric-definition.util';

describe('getAnalyticsMetricDefinitionKey', () => {
  it.each([
    'comments',
    'engagement',
    'engagementRate',
    'likes',
    'posts',
    'saves',
    'shares',
    'views',
  ])('returns the canonical translation key for %s', (metric) => {
    expect(getAnalyticsMetricDefinitionKey(metric)).toBe(
      `metricDefinitions.${metric}`,
    );
  });
  it.each([
    undefined,
    null,
    '',
    'Views',
    'totalLikes',
    'percentEngagement',
    'followers',
    '__proto__',
    'constructor',
    'toString',
    {},
    1,
  ])('rejects unsupported input %s without label guessing', (metric) => {
    expect(getAnalyticsMetricDefinitionKey(metric)).toBeUndefined();
  });
});
