import { describe, expect, it } from 'vitest';
import {
  FREE_TRIAL_DURATION_HOURS,
  FREE_TRIAL_DURATION_MS,
  FREE_TRIAL_EMAILS,
  FREE_TRIAL_ENDING_NOTICE_MS,
  isFreeTrialEmailTemplateKey,
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

  it('warns 24 hours before the trial ends', () => {
    expect(FREE_TRIAL_ENDING_NOTICE_MS).toBe(24 * 3_600_000);
  });

  it('keys each email definition by its own template key', () => {
    for (const [key, definition] of Object.entries(FREE_TRIAL_EMAILS)) {
      expect(definition.templateKey).toBe(key);
      expect(isFreeTrialEmailTemplateKey(key)).toBe(true);
    }
    expect(isFreeTrialEmailTemplateKey('credit-low')).toBe(false);
    expect(FREE_TRIAL_EMAILS['trial-ending'].subject).toBe(
      'Your free trial ends in 24 hours',
    );
    expect(FREE_TRIAL_EMAILS['trial-ended'].subject).toBe(
      'Your free trial has ended',
    );
    expect(FREE_TRIAL_EMAILS['trial-credits-low'].subject).toBe(
      "You're running low on credits",
    );
  });
});
