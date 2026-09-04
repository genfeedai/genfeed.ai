import {
  AnalyticsCounterCorrection,
  AnalyticsMetricAvailability,
} from '../enums';

export interface PeriodMetricResult {
  availability: AnalyticsMetricAvailability;
  correctionKind: AnalyticsCounterCorrection | null;
  value: number | null;
}

function isObservedNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Lifetime total is the latest valid snapshot at or before the reporting end.
 * Unavailable snapshots do not collapse to zero.
 */
export function lifetimeMetricValue(
  endValue: number | null | undefined,
  endAvailability: AnalyticsMetricAvailability = AnalyticsMetricAvailability.OBSERVED,
): PeriodMetricResult {
  if (
    endAvailability !== AnalyticsMetricAvailability.OBSERVED ||
    !isObservedNumber(endValue)
  ) {
    return {
      availability:
        endAvailability === AnalyticsMetricAvailability.OBSERVED
          ? AnalyticsMetricAvailability.UNAVAILABLE
          : endAvailability,
      correctionKind: null,
      value: null,
    };
  }

  return {
    availability: AnalyticsMetricAvailability.OBSERVED,
    correctionKind: null,
    value: endValue,
  };
}

/**
 * Period gain is end snapshot minus the latest snapshot before the window.
 *
 * New content (no start snapshot) uses the first observed end value as the
 * gain. Provider counter decreases never inflate growth.
 */
export function periodMetricGain(options: {
  endAvailability?: AnalyticsMetricAvailability;
  endValue: number | null | undefined;
  startAvailability?: AnalyticsMetricAvailability;
  startValue: number | null | undefined;
}): PeriodMetricResult {
  const endAvailability =
    options.endAvailability ?? AnalyticsMetricAvailability.OBSERVED;
  const startAvailability =
    options.startAvailability ?? AnalyticsMetricAvailability.OBSERVED;
  const lifetime = lifetimeMetricValue(options.endValue, endAvailability);

  if (lifetime.value === null) {
    return lifetime;
  }

  if (startAvailability !== AnalyticsMetricAvailability.OBSERVED) {
    return {
      availability: startAvailability,
      correctionKind: null,
      value: null,
    };
  }

  const startValue = options.startValue;
  const hasStart = isObservedNumber(startValue);

  if (!hasStart) {
    return {
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind: null,
      value: lifetime.value,
    };
  }

  if (lifetime.value < startValue) {
    return {
      availability: AnalyticsMetricAvailability.OBSERVED,
      correctionKind:
        lifetime.value === 0
          ? AnalyticsCounterCorrection.RESET
          : AnalyticsCounterCorrection.CORRECTION,
      value: 0,
    };
  }

  return {
    availability: AnalyticsMetricAvailability.OBSERVED,
    correctionKind: null,
    value: lifetime.value - startValue,
  };
}

export function distinctCount(
  ids: ReadonlyArray<string | null | undefined>,
): number {
  const unique = new Set<string>();
  for (const id of ids) {
    if (id) {
      unique.add(id);
    }
  }
  return unique.size;
}

export function derivedEngagementRate(options: {
  comments: number;
  likes: number;
  saves?: number;
  shares: number;
  views: number;
}): number {
  if (options.views <= 0) {
    return 0;
  }

  return (
    ((options.likes +
      options.comments +
      options.shares +
      (options.saves ?? 0)) /
      options.views) *
    100
  );
}
