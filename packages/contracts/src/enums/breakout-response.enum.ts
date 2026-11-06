/**
 * Lifecycle of one breakout response (`breakout_responses.state`).
 *
 * A response is `DETECTED` when the breakout is recorded and `PLANNED` once its
 * outputs are reserved. `SUPPRESSED` and `EXPIRED` close it; readers treat both
 * as final.
 */
export enum BreakoutResponseState {
  DETECTED = 'detected',
  PLANNED = 'planned',
  SUPPRESSED = 'suppressed',
  EXPIRED = 'expired',
}

/**
 * Lifecycle of one planned breakout output (`breakout_response_outputs.state`).
 *
 * `RESERVED` holds the slot, `GENERATING` runs or retains its material and
 * `AWAITING_REVIEW` waits on brand review. `SCHEDULED`, `PUBLISHING` and
 * `PUBLISHED` follow its post; `SUPPRESSED` and `EXPIRED` close it.
 */
export enum BreakoutResponseOutputState {
  RESERVED = 'reserved',
  GENERATING = 'generating',
  AWAITING_REVIEW = 'awaiting_review',
  SCHEDULED = 'scheduled',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  SUPPRESSED = 'suppressed',
  EXPIRED = 'expired',
}
