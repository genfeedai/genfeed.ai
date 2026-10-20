/**
 * Pacing for replies a person posts on X from the warm-up reply queue. A new
 * account that replies in bursts looks automated, so the queue caps the
 * rolling 24 hours and spaces replies apart. The `x-warmup` skill's own ceiling
 * is 5-8 replies a day in days 4-7.
 */
export const ASSISTED_X_REPLY_DAILY_CAP = 8;
export const ASSISTED_X_REPLY_MIN_GAP_MINUTES = 10;
export const ASSISTED_X_REPLY_MAX_LENGTH = 280;
