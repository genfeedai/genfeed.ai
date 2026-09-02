export const ANALYTICS_HOUR_MS = 60 * 60 * 1000;
export const ANALYTICS_SIX_HOURS_MS = 6 * ANALYTICS_HOUR_MS;
export const ANALYTICS_DAY_MS = 24 * ANALYTICS_HOUR_MS;
export const ANALYTICS_WEEK_MS = 7 * ANALYTICS_DAY_MS;
export const ANALYTICS_MONTH_MS = 30 * ANALYTICS_DAY_MS;
export const ANALYTICS_RETRY_DELAY_MS = 30 * 60 * 1000;

/**
 * Age-decayed next collect time. Recent posts stay on the hourly cadence;
 * older lifetime content is visited less often so producer work stays O(due).
 */
export function computeAnalyticsNextCollectAt(
  collectedAt: Date,
  publishedAt?: Date | null,
): Date {
  const publishedAtMs = publishedAt?.getTime();
  const collectedAtMs = collectedAt.getTime();
  const ageMs =
    publishedAtMs === undefined
      ? 0
      : Math.max(0, collectedAtMs - publishedAtMs);

  if (ageMs < ANALYTICS_DAY_MS) {
    return new Date(collectedAtMs + ANALYTICS_HOUR_MS);
  }
  if (ageMs < ANALYTICS_WEEK_MS) {
    return new Date(collectedAtMs + ANALYTICS_SIX_HOURS_MS);
  }
  if (ageMs < ANALYTICS_MONTH_MS) {
    return new Date(collectedAtMs + ANALYTICS_DAY_MS);
  }
  return new Date(collectedAtMs + ANALYTICS_WEEK_MS);
}

export function computeAnalyticsRetryCollectAt(
  failedAt: Date,
  isRetryable: boolean,
): Date {
  return new Date(
    failedAt.getTime() +
      (isRetryable ? ANALYTICS_RETRY_DELAY_MS : ANALYTICS_WEEK_MS),
  );
}
