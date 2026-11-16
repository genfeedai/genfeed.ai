export const SCHEDULED_POST_RETRY_BACKOFF_SECONDS = 60;

/** Wait between verifications of a provider publish whose outcome is unknown. */
export const SCHEDULED_POST_VERIFICATION_BACKOFF_SECONDS = 5 * 60;

/**
 * How long an unverifiable outcome is retried at the short backoff. Past it the
 * occurrence stays PUBLISHING with an operator-visible error and is only
 * re-verified at the slow backoff.
 */
export const SCHEDULED_POST_VERIFICATION_WINDOW_SECONDS = 24 * 60 * 60;
export const SCHEDULED_POST_UNVERIFIED_BACKOFF_SECONDS = 60 * 60;

/**
 * A provider rate limit proves nothing was published, so the post waits for the
 * provider's reset without spending the retry budget. With no reset time from
 * the provider it waits the default; no single wait runs past the cap; and a
 * post still rate limited after the give-up window fails with `rate_limited`.
 */
export const SCHEDULED_POST_RATE_LIMIT_DEFAULT_WAIT_SECONDS = 15 * 60;
export const SCHEDULED_POST_RATE_LIMIT_MAX_WAIT_SECONDS = 6 * 60 * 60;
export const SCHEDULED_POST_RATE_LIMIT_GIVE_UP_SECONDS = 24 * 60 * 60;
export const PUBLISH_RATE_LIMITED_CODE = 'rate_limited';

export const PUBLISH_OUTCOME_UNCONFIRMED_CODE = 'publish_outcome_unconfirmed';
export const PUBLISH_OUTCOME_UNVERIFIED_CODE = 'publish_outcome_unverified';

/**
 * What the owner reads when a due post has no approval for its current version
 * (it was invalidated by an edit, or never had one): nothing is sent, and
 * scheduling the post again requests a fresh approval.
 */
export const SCHEDULED_POST_APPROVAL_MISSING_MESSAGE =
  'This post has no approval for its current version, so it was not published. Review it and schedule it again.';

/**
 * One sweep run reads due posts in pages of this size, after a cursor on the
 * sort keys, so a burst is enqueued in the minute it is due rather than 50 a
 * minute.
 */
export const SCHEDULED_POST_SWEEP_PAGE_SIZE = 100;

/**
 * Most due posts one sweep run reads. Posts past it are logged and picked up by
 * the next run. A post already enqueued stays due until a worker claims it, so
 * it is read again (and skipped by its job id) until then; the cap bounds that
 * work, and the queue's FIFO order means a post past the cap waits no longer
 * than it would have behind the ones before it.
 */
export const SCHEDULED_POST_SWEEP_MAX_POSTS = 2000;

/** A sweep lock not renewed within this window is taken to belong to a dead run. */
export const SCHEDULED_POST_SWEEP_LOCK_TTL_MS = 2 * 60 * 1000;
