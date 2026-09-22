/**
 * Typed-decision constants (#4864). Shared by the service, the providers and
 * the offline benchmark.
 */

import type { TypedDecisionProviderName } from '@genfeedai/contracts/interfaces';

/**
 * Hard ceiling on choice options. A call site above it is a programming error
 * — the epic only ever decides bounded Genfeed enums — so the service throws
 * instead of degrading to the deterministic path.
 */
export const TYPED_DECISION_MAX_OPTIONS = 255;

/** Matches TYPED_DECISION_TIMEOUT_MS's Joi default. */
export const TYPED_DECISION_DEFAULT_TIMEOUT_MS = 800;

/**
 * How long a process may keep serving the operator's last-read provider
 * setting (#4908). Short enough that a kill switch lands within seconds,
 * long enough that a hot decision path costs one query per process, not one
 * per decision.
 */
export const TYPED_DECISION_PROVIDER_CACHE_TTL_MS = 15_000;

/** PostHog event name. One row per decision, never any prompt text. */
export const TYPED_DECISION_TELEMETRY_EVENT = 'typed_decision';

export const NULL_TYPED_DECISION_PROVIDER_NAME: TypedDecisionProviderName =
  'none';

export const JEV_TYPED_DECISION_PROVIDER_NAME: TypedDecisionProviderName =
  'jev';
