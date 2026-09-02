import type { PostFrequency } from '../..';

/**
 * Recurrence rule for an evergreen / repeating release.
 *
 * Modeled as an embeddable value object rather than its own aggregate: a
 * release group carries at most one rule, and concrete future occurrences are
 * expanded from it at execution time. `parentReleaseId` links a materialized
 * occurrence back to the root release that owns the series.
 *
 * Timezone handling lives on the owning release/target ({@link IReleaseGroup})
 * as an IANA identifier; recurrence resolution must apply that zone so repeats
 * land at the intended local time across DST transitions.
 */
export interface IRecurrenceRule {
  /** Base cadence unit. `NEVER` denotes a one-off (no recurrence). */
  frequency: PostFrequency;
  /** Repeat every N units of `frequency` (>= 1). */
  interval: number;
  /** Weekdays to fire on for weekly cadences (0 = Sunday .. 6 = Saturday). */
  weekdays: number[];
  /** Hard cap on repeat occurrences; omit only when a finite `endDate` exists. */
  maxRepeats?: number | null;
  /** ISO 8601 date after which no further occurrences fire. */
  endDate?: string | null;
  /** ISO 8601 timestamp of the next scheduled occurrence, if any. */
  nextRunAt?: string | null;
  /** Whether the finite recurrence has no remaining occurrences. */
  isExhausted?: boolean;
  /** Whether future materialization is paused without changing published history. */
  isPaused?: boolean;
  /** Number of occurrences already generated from this rule. */
  repeatCount: number;
  /** Release group that owns this rule, when the rule is stored separately. */
  parentReleaseId?: string | null;
}
