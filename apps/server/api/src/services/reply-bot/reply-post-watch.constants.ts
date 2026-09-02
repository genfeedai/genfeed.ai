/**
 * Delayed watch schedule for one owned post (minutes after publish).
 * Last attempt at 24h; no long-lived worker.
 */
export const REPLY_POST_WATCH_DELAYS_MINUTES = [
  2, 10, 30, 120, 360, 720, 1440,
] as const;

export const REPLY_POST_WATCH_MAX_ATTEMPTS =
  REPLY_POST_WATCH_DELAYS_MINUTES.length;
