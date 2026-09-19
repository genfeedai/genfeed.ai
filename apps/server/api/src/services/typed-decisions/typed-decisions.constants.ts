/**
 * Typed-decision constants (#4864). Shared by the service, the providers and
 * the offline benchmark.
 */

/**
 * Hard ceiling on choice options. A call site above it is a programming error
 * — the epic only ever decides bounded Genfeed enums — so the service throws
 * instead of degrading to the deterministic path.
 */
export const TYPED_DECISION_MAX_OPTIONS = 255;

/** Matches TYPED_DECISION_TIMEOUT_MS's Joi default. */
export const TYPED_DECISION_DEFAULT_TIMEOUT_MS = 800;

/** PostHog event name. One row per decision, never any prompt text. */
export const TYPED_DECISION_TELEMETRY_EVENT = 'typed_decision';

export const NULL_TYPED_DECISION_PROVIDER_NAME = 'none';

export const JEV_TYPED_DECISION_PROVIDER_NAME = 'jev';
