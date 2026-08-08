/**
 * Batch generation run-lease tuning.
 *
 * A batch is processed under a lease: the row's `updatedAt` is bumped by every
 * item persist, so a run that dies mid-batch (API reload, worker restart) stops
 * renewing it. Once the lease goes stale the batch can be re-claimed and
 * resumed instead of sitting in PROCESSING forever.
 */

/** A PROCESSING batch not touched within this window is treated as stranded. */
export const BATCH_LEASE_STALE_MS = 5 * 60 * 1000;

/**
 * A PENDING batch that was handed to the queue but never picked up within this
 * window is re-enqueued by the reconciliation sweep.
 */
export const BATCH_QUEUE_PICKUP_STALE_MS = 5 * 60 * 1000;

/** How many times a stranded batch may be resumed before it is failed out. */
export const BATCH_MAX_RESUME_ATTEMPTS = 3;

/** Upper bound on batches reconciled per sweep, so one tick stays bounded. */
export const BATCH_RECONCILE_SWEEP_LIMIT = 50;

/** Upper bound on durable credit shortfalls retried per settlement sweep. */
export const BATCH_SETTLEMENT_SHORTFALL_SWEEP_LIMIT = 50;
