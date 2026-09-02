import { TargetExecutionState } from '@genfeedai/enums';
import { mapAuthorizedSignalsOutcome } from './authorized-signals-outcome.util';

describe('mapAuthorizedSignalsOutcome', () => {
  it.each([
    TargetExecutionState.SCHEDULED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PUBLISHED,
    TargetExecutionState.FAILED,
    TargetExecutionState.PAUSED,
    TargetExecutionState.CANCELLED,
    TargetExecutionState.SKIPPED,
  ])('preserves supported outcome %s', (outcome) => {
    expect(mapAuthorizedSignalsOutcome(outcome)).toBe(outcome);
  });

  it.each([undefined, null, 'pending', 1])(
    'rejects unsupported outcome %s',
    (outcome) => {
      expect(mapAuthorizedSignalsOutcome(outcome)).toBeUndefined();
    },
  );
});
