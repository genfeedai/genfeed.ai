export enum AnalyticsMetricAvailability {
  OBSERVED = 'observed',
  UNAVAILABLE = 'unavailable',
  UNAUTHORIZED = 'unauthorized',
  EXPIRED = 'expired',
  FAILED = 'failed',
  UNATTRIBUTED = 'unattributed',
  AMBIGUOUS = 'ambiguous',
}

export enum AnalyticsCounterCorrection {
  RESET = 'reset',
  CORRECTION = 'correction',
}
