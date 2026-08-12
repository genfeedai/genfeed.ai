/** BullMQ job limiters for analytics collectors. Replace per-item sleeps. */
export const ANALYTICS_JOB_LIMITER = { duration: 60_000, max: 20 } as const;
export const ANALYTICS_TWITTER_JOB_LIMITER = {
  duration: 60_000,
  max: 15,
} as const;
