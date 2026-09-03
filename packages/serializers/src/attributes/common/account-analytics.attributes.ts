import { createEntityAttributes } from '@genfeedai/helpers';

export const accountAnalyticsListAttributes = createEntityAttributes([
  'accounts',
  'page',
  'limit',
  'total',
  'totalPages',
  'unattributedPostCount',
]);

export const accountAnalyticsTopAttributes = createEntityAttributes([
  'accounts',
]);

export const accountAnalyticsDetailAttributes = createEntityAttributes([
  'coverage',
  'evaluation',
  'freshnessHours',
  'growth',
  'identity',
  'metrics',
  'publishedPosts',
  'series',
  'topPosts',
]);

export const fleetEvaluationPolicyAttributes = createEntityAttributes([
  'brandOverrides',
  'healthyMin',
  'isEnabled',
  'metric',
  'minPublishedPosts',
  'platformPolicies',
  'version',
  'watchMin',
  'windowWeeks',
]);
