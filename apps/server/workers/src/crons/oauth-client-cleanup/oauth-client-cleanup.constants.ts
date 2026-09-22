/** Dynamic OAuth clients that never completed a sign-in are deleted after this many days. */
export const OAUTH_CLIENT_CLEANUP_RETENTION_DAYS = 7;

/** Rows deleted per statement, so one sweep never holds a long table lock. */
export const OAUTH_CLIENT_CLEANUP_BATCH_SIZE = 500;

/** Daily 03:45 UTC — after transcript purge (02:15) and Sunday model deprecation (03:00). */
export const OAUTH_CLIENT_CLEANUP_SCHEDULE = '45 3 * * *';
