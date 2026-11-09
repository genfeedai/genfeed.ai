import { describe, expect, it } from 'vitest';
import {
  TARGET_VALIDATION_STATE_MACHINE,
  TargetValidationState,
} from './scheduler.enum';

describe('TARGET_VALIDATION_STATE_MACHINE', () => {
  it.each([
    [
      TargetValidationState.PENDING,
      [
        TargetValidationState.VALID,
        TargetValidationState.WARNING,
        TargetValidationState.INVALID,
      ],
    ],
    [
      TargetValidationState.VALID,
      [TargetValidationState.WARNING, TargetValidationState.INVALID],
    ],
    [
      TargetValidationState.WARNING,
      [TargetValidationState.VALID, TargetValidationState.INVALID],
    ],
    [
      TargetValidationState.INVALID,
      [TargetValidationState.VALID, TargetValidationState.WARNING],
    ],
  ])('%s moves to %j', (from, expected) => {
    expect(TARGET_VALIDATION_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it('never returns a validated target to pending', () => {
    expect(
      TARGET_VALIDATION_STATE_MACHINE.sourcesOf(TargetValidationState.PENDING),
    ).toEqual([]);
  });
});
