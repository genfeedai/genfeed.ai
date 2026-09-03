import { describe, expect, it } from 'vitest';
import {
  AnalyticsCounterCorrection,
  AnalyticsMetricAvailability,
  derivedEngagementRate,
  distinctCount,
  lifetimeMetricValue,
  periodMetricGain,
} from '../../src';

describe('periodMetricGain', () => {
  it('reports period gain from window-boundary snapshots, not summed lifetime totals', () => {
    expect(periodMetricGain({ endValue: 1200, startValue: 1000 })).toEqual({
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind: null,
      value: 200,
    });
  });

  it('uses the first observation as the gain for content that starts in the window', () => {
    expect(periodMetricGain({ endValue: 400, startValue: null })).toEqual({
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind: null,
      value: 400,
    });
  });

  it('does not inflate growth when a provider counter decreases', () => {
    expect(periodMetricGain({ endValue: 800, startValue: 1000 })).toEqual({
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind: AnalyticsCounterCorrection.CORRECTION,
      value: 0,
    });
    expect(periodMetricGain({ endValue: 0, startValue: 1000 })).toEqual({
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind: AnalyticsCounterCorrection.RESET,
      value: 0,
    });
  });

  it('keeps unavailable metrics distinct from zero', () => {
    expect(
      periodMetricGain({
        endAvailability: AnalyticsMetricAvailability.UNAVAILABLE,
        endValue: null,
        startValue: 10,
      }),
    ).toEqual({
      availability: AnalyticsMetricAvailability.UNAVAILABLE,
      correctionKind: null,
      value: null,
    });
  });
});

describe('lifetimeMetricValue', () => {
  it('uses the latest observed snapshot', () => {
    expect(lifetimeMetricValue(1200)).toEqual({
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind: null,
      value: 1200,
    });
  });
});

describe('distinctCount', () => {
  it('counts unique posts, not snapshot rows', () => {
    expect(distinctCount(['p1', 'p1', 'p2', null, 'p2'])).toBe(2);
  });
});

describe('derivedEngagementRate', () => {
  it('derives rate from period numerators and views, not averaged snapshot rates', () => {
    expect(
      derivedEngagementRate({
        comments: 10,
        likes: 20,
        saves: 5,
        shares: 5,
        views: 100,
      }),
    ).toBe(40);
  });
});
