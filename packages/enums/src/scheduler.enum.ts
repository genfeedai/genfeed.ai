/**
 * Post Scheduler domain enums.
 *
 * These describe the lifecycle of a scheduled *release group* (one composed
 * piece of content fanned out to many channels) and of each individual
 * *channel target* within it. They are the canonical states every surface
 * (composer, calendar, workers, public API, MCP, CLI) reads and writes.
 *
 * Foundation for epic #1123 (Post Scheduler Loop), issue #1124.
 */

/**
 * Lifecycle state of a release group as a whole.
 *
 * `PARTIALLY_PUBLISHED` is an aggregate-only state: it means some channel
 * targets published while others failed or were cancelled. Individual targets
 * never carry this value — see {@link TargetExecutionState}.
 */
export enum ReleaseStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  PARTIALLY_PUBLISHED = 'partially-published',
}

/**
 * Execution state of a single channel target.
 *
 * Mirrors {@link ReleaseStatus} minus the aggregate `partially-published`
 * value, plus `SKIPPED` for targets intentionally excluded from a run (e.g.
 * a disabled credential or a recurrence occurrence with no eligible content).
 */
export enum TargetExecutionState {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * Result of validating a channel target against its platform capability rules
 * before it is allowed to be scheduled. `WARNING` is non-blocking; `INVALID`
 * blocks scheduling.
 */
export enum TargetValidationState {
  PENDING = 'pending',
  VALID = 'valid',
  WARNING = 'warning',
  INVALID = 'invalid',
}

/**
 * Kind of supplemental content attached to a release or a specific channel
 * target: a first comment, a follow-up thread, or an appended signature.
 */
export enum ReleaseAttachmentKind {
  COMMENT = 'comment',
  THREAD = 'thread',
  SIGNATURE = 'signature',
}
