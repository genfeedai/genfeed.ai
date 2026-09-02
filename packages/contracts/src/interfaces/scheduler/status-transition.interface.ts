/**
 * Audit-friendly record of a single status change on a release group or a
 * channel target. A durable transition log is what lets the calendar and API
 * explain *why* something is in its current state without a separate events
 * table lookup.
 *
 * `from`/`to` are stored as raw string values (not the enum types) so a single
 * shape covers both {@link ReleaseStatus} and {@link TargetExecutionState}
 * histories.
 */
export interface IScheduleStatusTransition {
  /** Previous state; `null` for the initial creation transition. */
  from: string | null;
  /** New state after this transition. */
  to: string;
  /** ISO 8601 timestamp of when the transition occurred. */
  at: string;
  /** Canonical `users.id` of the actor, or `null` for system transitions. */
  actorId?: string | null;
  /** Optional human/agent-readable reason (e.g. provider error, manual pause). */
  reason?: string | null;
}
