import {
  ANALYTICS_DAY_MS,
  ANALYTICS_HOUR_MS,
  ANALYTICS_RETRY_DELAY_MS,
  ANALYTICS_SIX_HOURS_MS,
  ANALYTICS_WEEK_MS,
  computeAnalyticsNextCollectAt,
  computeAnalyticsRetryCollectAt,
} from './analytics-next-collect-at';

describe('computeAnalyticsNextCollectAt', () => {
  const collectedAt = new Date('2026-08-12T12:00:00.000Z');

  it('schedules hourly collection for posts younger than a day', () => {
    const publishedAt = new Date(collectedAt.getTime() - 2 * ANALYTICS_HOUR_MS);

    expect(computeAnalyticsNextCollectAt(collectedAt, publishedAt)).toEqual(
      new Date(collectedAt.getTime() + ANALYTICS_HOUR_MS),
    );
  });

  it('schedules a 6-hour cadence during the first week', () => {
    const publishedAt = new Date(collectedAt.getTime() - 3 * ANALYTICS_DAY_MS);

    expect(computeAnalyticsNextCollectAt(collectedAt, publishedAt)).toEqual(
      new Date(collectedAt.getTime() + ANALYTICS_SIX_HOURS_MS),
    );
  });

  it('schedules a daily cadence during the first month', () => {
    const publishedAt = new Date(collectedAt.getTime() - 14 * ANALYTICS_DAY_MS);

    expect(computeAnalyticsNextCollectAt(collectedAt, publishedAt)).toEqual(
      new Date(collectedAt.getTime() + ANALYTICS_DAY_MS),
    );
  });

  it('schedules a weekly cadence for older posts', () => {
    const publishedAt = new Date(collectedAt.getTime() - 60 * ANALYTICS_DAY_MS);

    expect(computeAnalyticsNextCollectAt(collectedAt, publishedAt)).toEqual(
      new Date(collectedAt.getTime() + ANALYTICS_WEEK_MS),
    );
  });

  it('treats a missing publishedAt as a new post', () => {
    expect(computeAnalyticsNextCollectAt(collectedAt)).toEqual(
      new Date(collectedAt.getTime() + ANALYTICS_HOUR_MS),
    );
  });
});

describe('computeAnalyticsRetryCollectAt', () => {
  const failedAt = new Date('2026-08-12T12:00:00.000Z');

  it('retries retryable failures after 30 minutes', () => {
    expect(computeAnalyticsRetryCollectAt(failedAt, true)).toEqual(
      new Date(failedAt.getTime() + ANALYTICS_RETRY_DELAY_MS),
    );
  });

  it('parks non-retryable failures for a week', () => {
    expect(computeAnalyticsRetryCollectAt(failedAt, false)).toEqual(
      new Date(failedAt.getTime() + ANALYTICS_WEEK_MS),
    );
  });
});
