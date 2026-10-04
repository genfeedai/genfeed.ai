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

export const PUBLISH_OUTCOME_UNCONFIRMED_CODE = 'publish_outcome_unconfirmed';
export const PUBLISH_OUTCOME_UNVERIFIED_CODE = 'publish_outcome_unverified';
