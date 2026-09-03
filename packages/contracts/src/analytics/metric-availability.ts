import { AnalyticsMetricAvailability } from '../enums/analytics-metric-availability.enum';

export type AnalyticsMetricAvailabilityMap = Partial<
  Record<string, AnalyticsMetricAvailability>
>;

export function observedOrUnavailable(value: number | null | undefined): {
  availability: AnalyticsMetricAvailability;
  value: number | null;
} {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      availability: AnalyticsMetricAvailability.OBSERVED,
      value,
    };
  }

  return {
    availability: AnalyticsMetricAvailability.UNAVAILABLE,
    value: null,
  };
}

export function readMetricAvailability(
  map: AnalyticsMetricAvailabilityMap | null | undefined,
  key: string,
  fallbackValue?: number | null,
): AnalyticsMetricAvailability {
  const recorded = map?.[key];
  if (recorded) {
    return recorded;
  }

  return typeof fallbackValue === 'number'
    ? AnalyticsMetricAvailability.OBSERVED
    : AnalyticsMetricAvailability.UNAVAILABLE;
}
