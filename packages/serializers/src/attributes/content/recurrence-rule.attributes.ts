import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Recurrence rule for evergreen / repeating releases (#1124). Serialized both
 * as an embedded object on a release and — when persisted separately — as its
 * own resource keyed by `parentReleaseId`.
 */
export const recurrenceRuleAttributes = createEntityAttributes([
  'frequency',
  'interval',
  'weekdays',
  'maxRepeats',
  'endDate',
  'nextRunAt',
  'repeatCount',
  'parentReleaseId',
]);
