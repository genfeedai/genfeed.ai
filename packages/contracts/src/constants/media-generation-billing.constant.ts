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

/** One frozen tariff for all actual outputs from a native batch or fanout. */
export const MEDIA_GENERATION_GROUP_WORKLOAD_TYPE = 'media-generation-group';

/** An execution-owned immutable allocation, fenced separately from generic expiry. */
export const WORKFLOW_GENERATION_WORKLOAD_TYPE = 'workflow-generation';
