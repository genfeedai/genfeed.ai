/** Every five minutes: a receipt only needs recovery once its 15-minute dispatch window has passed. */
export const BRANDED_DISPATCH_RECOVERY_SCHEDULE = '*/5 * * * *';

/** Receipts recovered per page, so one sweep never holds a long transaction. */
export const BRANDED_DISPATCH_RECOVERY_BATCH_SIZE = 100;

/** Pages per run; a backlog larger than this drains over the next runs. */
export const BRANDED_DISPATCH_RECOVERY_MAX_PAGES = 20;
