import { TargetExecutionState } from '@genfeedai/enums';

export type GenfeedPublishOutcome =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'skipped';

const GENFEED_PUBLISH_OUTCOMES = new Set<string>([
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.FAILED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.CANCELLED,
  TargetExecutionState.SKIPPED,
]);

export function mapAuthorizedSignalsOutcome(
  value: unknown,
): GenfeedPublishOutcome | undefined {
  return typeof value === 'string' && GENFEED_PUBLISH_OUTCOMES.has(value)
    ? (value as GenfeedPublishOutcome)
    : undefined;
}
