/** Soft-deleted agent transcript fields are wiped after this many days. */
export const TRANSCRIPT_PURGE_RETENTION_DAYS = 30;

/** Daily 02:15 UTC — after YouTube status (01:00) and before Sunday model deprecation (03:00). */
export const TRANSCRIPT_PURGE_SCHEDULE = '15 2 * * *';
