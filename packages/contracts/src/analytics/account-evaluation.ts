import { AccountEvaluationState } from '../enums/account-evaluation-state.enum';
import { AnalyticsMetric } from '../enums/analytics-metric.enum';
import { AnalyticsMetricAvailability } from '../enums/analytics-metric-availability.enum';
import type { IFleetEvaluationPolicy } from '../interfaces/analytics/fleet-evaluation-policy.interface';

export const DEFAULT_FLEET_EVALUATION_FRESHNESS_HOURS = 48;
export const DEFAULT_FLEET_EVALUATION_COVERAGE = 0.5;

const RANKABLE_METRICS = new Set<AnalyticsMetric>([
  AnalyticsMetric.VIEWS,
  AnalyticsMetric.VIDEO_VIEWS,
  AnalyticsMetric.IMPRESSIONS,
  AnalyticsMetric.REACH,
  AnalyticsMetric.ENGAGEMENT,
  AnalyticsMetric.FOLLOWERS,
  AnalyticsMetric.SUBSCRIBERS,
  AnalyticsMetric.POSTS,
]);

export function isFleetEvaluationMetric(metric: AnalyticsMetric): boolean {
  return RANKABLE_METRICS.has(metric);
}

export interface AccountEvaluationInput {
  accountAgeDays: number;
  coverage: number;
  freshnessHours: number | null;
  metricAvailability: AnalyticsMetricAvailability;
  metricValue: number | null;
  policy: IFleetEvaluationPolicy | null | undefined;
  publishedPosts: number;
}

export interface AccountEvaluationEvidence {
  accountAgeDays: number;
  coverage: number;
  freshnessHours: number | null;
  metric: AnalyticsMetric;
  metricAvailability: AnalyticsMetricAvailability;
  metricValue: number | null;
  minPublishedPosts: number;
  policyVersion: number;
  publishedPosts: number;
  thresholds: {
    healthyMin: number;
    watchMin: number;
  };
  windowWeeks: number;
}

export interface AccountEvaluationResult {
  evidence: AccountEvaluationEvidence;
  state: AccountEvaluationState;
}

export function classifyAccountEvaluation(
  input: AccountEvaluationInput,
): AccountEvaluationResult | null {
  const policy = input.policy;
  if (!policy?.isEnabled) {
    return null;
  }

  const evidence: AccountEvaluationEvidence = {
    accountAgeDays: input.accountAgeDays,
    coverage: input.coverage,
    freshnessHours: input.freshnessHours,
    metric: policy.metric,
    metricAvailability: input.metricAvailability,
    metricValue: input.metricValue,
    minPublishedPosts: policy.minPublishedPosts,
    policyVersion: policy.version,
    publishedPosts: input.publishedPosts,
    thresholds: {
      healthyMin: policy.healthyMin,
      watchMin: policy.watchMin,
    },
    windowWeeks: policy.windowWeeks,
  };

  const requiredAgeDays = policy.windowWeeks * 7;
  const isStale =
    input.freshnessHours === null ||
    input.freshnessHours > DEFAULT_FLEET_EVALUATION_FRESHNESS_HOURS;
  const hasCoverage = input.coverage >= DEFAULT_FLEET_EVALUATION_COVERAGE;
  const hasMetric =
    input.metricAvailability === AnalyticsMetricAvailability.OBSERVED &&
    input.metricValue !== null;

  if (
    input.accountAgeDays < requiredAgeDays ||
    input.publishedPosts < policy.minPublishedPosts ||
    !hasMetric ||
    !hasCoverage ||
    isStale
  ) {
    return {
      evidence,
      state: AccountEvaluationState.INSUFFICIENT_DATA,
    };
  }

  if (input.metricValue >= policy.healthyMin) {
    return { evidence, state: AccountEvaluationState.HEALTHY };
  }

  if (input.metricValue >= policy.watchMin) {
    return { evidence, state: AccountEvaluationState.WATCH };
  }

  return { evidence, state: AccountEvaluationState.UNDERPERFORMING };
}
