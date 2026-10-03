/**
 * CreditReservation.workloadType for a request-level generation hold that has
 * not yet been split across its outputs (#5657).
 */
export const GENERATION_POOL_WORKLOAD_TYPE = 'generation';

/**
 * CreditReservation.workloadType for the hold that pays for exactly one output
 * ingredient (`workloadId`). Settled when the output is generated, released
 * when it fails or never finishes.
 */
export const MEDIA_GENERATION_WORKLOAD_TYPE = 'media-generation';

/**
 * Admission deadline for generation funding. Reconciliation closes further
 * dispatch at this deadline; provider intent remains unresolved until durable
 * completion or authoritative negative evidence arrives. TTL is not failure proof.
 */
export const MEDIA_GENERATION_HOLD_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * How long past its TTL a hold that carries a provider submission intent may
 * wait for confirmed-failure proof before reconciliation expires it (#5887).
 * Expiry is safe because an output that completes later is charged on its own
 * (see `MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX`), not given away.
 */
export const MEDIA_GENERATION_INTENT_HOLD_CEILING_MS = 24 * 60 * 60 * 1000;

/**
 * How long after a hold expires reconciliation keeps looking for an output
 * that completed late and still needs its charge (#5886).
 */
export const MEDIA_GENERATION_LATE_SETTLEMENT_WINDOW_MS =
  7 * 24 * 60 * 60 * 1000;

/**
 * Wallet overdraft allowed for a late charge. The ledger caps the wallet's
 * total negative balance, not each deduction, so the limit must not be the
 * charge itself: a second late charge on an empty wallet would be rejected and
 * a delivered output left unbilled. The output already exists, so the charge
 * always records.
 */
export const MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS = 1_000_000;

/**
 * Idempotency-key prefix of the charge recorded when an output completes after
 * its hold ended. The key carries the hold id, so redelivered webhooks and
 * sweeps collapse into a single ledger transaction.
 */
export const MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX =
  'media-generation-late-settle';

/** One frozen tariff for all actual outputs from a native batch or fanout. */
export const MEDIA_GENERATION_GROUP_WORKLOAD_TYPE = 'media-generation-group';

/** An execution-owned immutable allocation, fenced separately from generic expiry. */
export const WORKFLOW_GENERATION_WORKLOAD_TYPE = 'workflow-generation';
