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
 * How long a bound output hold outlives its request. Provider waits are
 * 180-600s, poll queues about 10 minutes and the stuck-ingredient sweeper fails
 * anything still PROCESSING after 30-90 minutes, so two hours always sees a
 * terminal ingredient.
 */
export const MEDIA_GENERATION_HOLD_TTL_MS = 2 * 60 * 60 * 1000;
