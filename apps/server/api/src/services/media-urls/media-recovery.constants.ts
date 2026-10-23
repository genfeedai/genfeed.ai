/** A PENDING variant whose job was lost is retried after this long. */
export const MEDIA_VARIANT_STALE_PENDING_MS = 15 * 60 * 1000;

/** First FAILED retry waits this long; each further attempt doubles it. */
export const MEDIA_VARIANT_RETRY_BASE_MS = 10 * 60 * 1000;

/** Recovery gives up after this many requeues and leaves the variant FAILED. */
export const MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS = 5;

/** Variants and ingredients handled per recovery sweep. */
export const MEDIA_RECOVERY_BATCH_SIZE = 25;

export const MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE = 'RECOVERY_EXHAUSTED';
