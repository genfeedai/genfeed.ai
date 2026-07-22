import type { PostFrequency } from '@genfeedai/enums';

/**
 * Recurrence rule for an evergreen / repeating release.
 *
 * Modeled as an embeddable value object rather than its own aggregate: a
 * release group carries at most one rule, and concrete future occurrences are
 * expanded from it at execution time. `parentReleaseId` links a materialized
 * occurrence back to the release that owns the rule (open question in #1124:
 * occurrences may later be persisted as their own generated records).
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
  /** Number of occurrences already generated from this rule. */
  repeatCount: number;
  /** Release group that owns this rule, when the rule is stored separately. */
  parentReleaseId?: string | null;
}
