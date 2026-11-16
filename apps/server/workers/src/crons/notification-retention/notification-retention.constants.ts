/** A delivery in a final state is deleted this many days after it was created. */
export const NOTIFICATION_DELIVERY_RETENTION_DAYS = 30;

/** An inbox item is deleted this many days after the user read it. */
export const NOTIFICATION_INBOX_READ_RETENTION_DAYS = 30;

/** An inbox item is deleted this many days after it occurred, read or not. */
export const NOTIFICATION_INBOX_MAX_RETENTION_DAYS = 90;

/** An event is deleted this many days after it occurred, once nothing references it. */
export const NOTIFICATION_EVENT_RETENTION_DAYS = 90;

/** Rows deleted per statement, so one sweep never holds a long lock. */
export const NOTIFICATION_RETENTION_BATCH_SIZE = 1000;

/** Batches per table in one run, so a backlog drains over several days instead of one long tick. */
export const NOTIFICATION_RETENTION_MAX_BATCHES = 200;

/** Daily 04:05 UTC — after OAuth client cleanup (03:45) and before the 05:00 hour. */
export const NOTIFICATION_RETENTION_SCHEDULE = '5 4 * * *';
