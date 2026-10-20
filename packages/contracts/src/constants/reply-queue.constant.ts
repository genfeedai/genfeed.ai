/**
 * Pacing for replies a person posts on X from the warm-up reply queue. A new
 * account that replies in bursts looks automated, so the queue caps the
 * rolling 24 hours and spaces replies apart. The `x-warmup` skill's own ceiling
 * is 5-8 replies a day in days 4-7.
 */
export const ASSISTED_X_REPLY_DAILY_CAP = 8;
export const ASSISTED_X_REPLY_MIN_GAP_MINUTES = 10;
export const ASSISTED_X_REPLY_MAX_LENGTH = 280;

/**
 * Who the warm-up reply queue suggests answering. Under the floor a reply is
 * rarely seen; above the ceiling it drowns in hundreds of others.
 */
export const WARMUP_TARGET_MIN_FOLLOWERS = 1_000;
export const WARMUP_TARGET_MAX_FOLLOWERS = 250_000;
/** Accounts one brand's warm-up monitor follows at a time. */
export const WARMUP_MAX_MONITORED_TARGETS = 25;
