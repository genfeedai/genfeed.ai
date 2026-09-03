import { describe, expect, it } from 'vitest';
import {
  AccountEvaluationState,
  AnalyticsMetric,
  AnalyticsMetricAvailability,
  classifyAccountEvaluation,
} from '../../src';
import type { IFleetEvaluationPolicy } from '../../src/interfaces';

const policy: IFleetEvaluationPolicy = {
  healthyMin: 1000,
  isEnabled: true,
  metric: AnalyticsMetric.VIEWS,
  minPublishedPosts: 8,
  version: 1,
  watchMin: 400,
  windowWeeks: 4,
};

describe('classifyAccountEvaluation', () => {
  it('returns no classification when no policy is enabled', () => {
    expect(
      classifyAccountEvaluation({
        accountAgeDays: 60,
        coverage: 1,
        freshnessHours: 1,
        metricAvailability: AnalyticsMetricAvailability.OBSERVED,
        metricValue: 10,
        policy: { ...policy, isEnabled: false },
        publishedPosts: 20,
      }),
    ).toBeNull();
  });

  it('marks new or uncovered accounts as insufficient data, never underperforming', () => {
    expect(
      classifyAccountEvaluation({
        accountAgeDays: 10,
        coverage: 1,
        freshnessHours: 1,
        metricAvailability: AnalyticsMetricAvailability.OBSERVED,
        metricValue: 0,
        policy,
        publishedPosts: 20,
      })?.state,
    ).toBe(AccountEvaluationState.INSUFFICIENT_DATA);

    expect(
      classifyAccountEvaluation({
        accountAgeDays: 60,
        coverage: 1,
        freshnessHours: 1,
        metricAvailability: AnalyticsMetricAvailability.UNAVAILABLE,
        metricValue: null,
        policy,
        publishedPosts: 20,
      })?.state,
    ).toBe(AccountEvaluationState.INSUFFICIENT_DATA);
  });

  it('classifies eligible accounts from the configured thresholds', () => {
    const base = {
      accountAgeDays: 60,
      coverage: 1,
      freshnessHours: 1,
      metricAvailability: AnalyticsMetricAvailability.OBSERVED,
      policy,
      publishedPosts: 20,
    };

    expect(
      classifyAccountEvaluation({ ...base, metricValue: 1500 })?.state,
    ).toBe(AccountEvaluationState.HEALTHY);
    expect(
      classifyAccountEvaluation({ ...base, metricValue: 500 })?.state,
    ).toBe(AccountEvaluationState.WATCH);
    expect(
      classifyAccountEvaluation({ ...base, metricValue: 100 })?.state,
    ).toBe(AccountEvaluationState.UNDERPERFORMING);
  });
});
