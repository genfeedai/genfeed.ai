export const AD_INSIGHTS_AGGREGATION_QUEUE = 'ad-insights-aggregation';
export const AD_INSIGHTS_PLATFORM_SCOPE = 'platform';
export const AD_INSIGHTS_SCHEDULE_CRON = '0 6 * * 0';
export const AD_INSIGHTS_SOURCE_ISSUE = 796;
export const AD_INSIGHTS_MIN_ORGS_FOR_AGGREGATION = 5;

export const AD_INSIGHTS_INSIGHT_TYPES = [
  'top_headlines',
  'best_ctas',
  'optimal_spend',
  'platform_comparison',
  'industry_benchmark',
] as const;

export const AD_INSIGHTS_SCHEDULING_CLASSIFICATION = {
  dataScope: 'public_ad_performance',
  minOrganizations: AD_INSIGHTS_MIN_ORGS_FOR_AGGREGATION,
  queueName: AD_INSIGHTS_AGGREGATION_QUEUE,
  rationale:
    'Ad insights aggregate public-scope ad performance with k-anonymity across organizations; per-org workflows would duplicate global work and weaken the data contract.',
  schedule: AD_INSIGHTS_SCHEDULE_CRON,
  scope: AD_INSIGHTS_PLATFORM_SCOPE,
  sourceIssue: AD_INSIGHTS_SOURCE_ISSUE,
} as const;

export function buildAdInsightsAggregationWindow(
  now: Date = new Date(),
): string {
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dayOffset = now.getUTCDay();
  const weekStart = new Date(utcMidnight - dayOffset * 24 * 60 * 60 * 1000);
  return weekStart.toISOString().slice(0, 10);
}

export function buildAdInsightsAggregationJobId(
  aggregationWindow: string,
): string {
  return `${AD_INSIGHTS_AGGREGATION_QUEUE}:${AD_INSIGHTS_PLATFORM_SCOPE}:weekly:${aggregationWindow}`;
}
