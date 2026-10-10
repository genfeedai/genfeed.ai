import { describe, expect, it } from 'vitest';
import {
  FREE_TRIAL_DURATION_HOURS,
  FREE_TRIAL_DURATION_MS,
  resolveFreeTrialEndsAt,
} from './free-trial.constant';

describe('free-trial.constant', () => {
  it('runs the trial for 72 hours from organization creation', () => {
    expect(FREE_TRIAL_DURATION_HOURS).toBe(72);
    expect(FREE_TRIAL_DURATION_MS).toBe(72 * 3_600_000);
    expect(
      resolveFreeTrialEndsAt(new Date('2026-10-01T09:00:00.000Z')),
    ).toEqual(new Date('2026-10-04T09:00:00.000Z'));
  });
});
