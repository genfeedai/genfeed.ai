/**
 * Turbo run run-lease tuning.
 *
 * A run is processed under a lease: the row's `updatedAt` is bumped by every
 * item persist, so a run that dies mid-run (API reload, worker restart) stops
 * renewing it. Once the lease goes stale the run can be re-claimed and
 * resumed instead of sitting in PROCESSING forever.
 */

/** A PROCESSING run not touched within this window is treated as stranded. */
export const TURBO_RUN_LEASE_STALE_MS = 5 * 60 * 1000;

/**
 * A PENDING run that was handed to the queue but never picked up within this
 * window is re-enqueued by the reconciliation sweep.
 */
export const TURBO_RUN_QUEUE_PICKUP_STALE_MS = 5 * 60 * 1000;

/** How many times a stranded run may be resumed before it is failed out. */
export const TURBO_RUN_MAX_RESUME_ATTEMPTS = 3;

/** Upper bound on runs reconciled per sweep, so one tick stays bounded. */
export const TURBO_RUN_RECONCILE_SWEEP_LIMIT = 50;

/** Upper bound on durable credit shortfalls retried per settlement sweep. */
export const TURBO_RUN_SETTLEMENT_SHORTFALL_SWEEP_LIMIT = 50;

/**
 * Typed `turbo_run_items` upserts stay bounded. Unbounded `Promise.all` over a
 * 100-item run opens 100 concurrent connections; chunk so one writer stays
 * inside the pool. Tombstone restore still needs per-row upsert (not
 * createMany skipDuplicates), so this is sequential chunks of upserts.
 */
export const BATCH_ITEM_UPSERT_CHUNK_SIZE = 50;
