/**
 * X reply watch: replies to posts published in the last day, read from each
 * account's mentions timeline. X bills every read, so the sweep makes one
 * mentions call per account per tick, and only for accounts that published
 * inside the window.
 */
export const X_REPLY_WATCH_INTERVAL_MINUTES = 15;
export const X_REPLY_WATCH_WINDOW_HOURS = 24;

export const X_REPLY_WATCH_SCHEDULE = `*/${X_REPLY_WATCH_INTERVAL_MINUTES} * * * *`;
export const X_REPLY_WATCH_INTERVAL_MS =
  X_REPLY_WATCH_INTERVAL_MINUTES * 60_000;
export const X_REPLY_WATCH_WINDOW_MS = X_REPLY_WATCH_WINDOW_HOURS * 3_600_000;

/** One page per call; X caps the mentions page at 100. */
export const X_REPLY_WATCH_MAX_RESULTS = 100;
/** Accounts polled at once inside one sweep. */
export const X_REPLY_WATCH_CONCURRENCY = 5;

/** Held for less than one interval so a crashed sweep never skips two ticks. */
export const X_REPLY_WATCH_LOCK_KEY = 'x-reply-watch:sweep';
export const X_REPLY_WATCH_LOCK_TTL_SECONDS =
  X_REPLY_WATCH_INTERVAL_MINUTES * 60 - 60;

/** The since_id cursor outlives the window so a quiet day resumes cheaply. */
export const X_REPLY_WATCH_CURSOR_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Rate-limit waits without a provider reset hint, and the longest we honour. */
export const X_REPLY_WATCH_RATE_LIMIT_FALLBACK_MS = X_REPLY_WATCH_INTERVAL_MS;
export const X_REPLY_WATCH_RATE_LIMIT_MAX_MS = 6 * 3_600_000;
/** A tier or scope refusal will not clear within the window. */
export const X_REPLY_WATCH_TIER_BACKOFF_MS = X_REPLY_WATCH_WINDOW_MS;

export function xReplyWatchCursorKey(credentialId: string): string {
  return `x-reply-watch:cursor:${credentialId}`;
}

export function xReplyWatchBackoffKey(credentialId: string): string {
  return `x-reply-watch:backoff:${credentialId}`;
}
