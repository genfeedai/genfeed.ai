import { describe, expect, it } from 'vitest';
import {
  FREE_TRIAL_DURATION_HOURS,
  FREE_TRIAL_DURATION_MS,
  FREE_TRIAL_EMAILS,
  FREE_TRIAL_ENDING_NOTICE_MS,
  FREE_TRIAL_ROLLOUT_AT_DEFAULT,
  isFreeTrialEmailTemplateKey,
  resolveFreeTrialEndsAt,
  resolveFreeTrialRolloutAt,
} from './free-trial.constant';

describe('free-trial.constant', () => {
  it('runs the trial for 72 hours from organization creation', () => {
    expect(FREE_TRIAL_DURATION_HOURS).toBe(72);
    expect(FREE_TRIAL_DURATION_MS).toBe(72 * 3_600_000);
    const rolloutAt = new Date('2026-10-11T00:00:00.000Z');
    expect(
      resolveFreeTrialEndsAt(new Date('2026-10-20T09:00:00.000Z'), rolloutAt),
    ).toEqual(new Date('2026-10-23T09:00:00.000Z'));
  });

  it('gives an organization created before the rollout a full window from the rollout', () => {
    expect(
      resolveFreeTrialEndsAt(
        new Date('2025-01-01T00:00:00.000Z'),
        new Date('2026-10-11T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2026-10-14T00:00:00.000Z'));
  });

  it('reads the rollout from configuration and falls back to the default', () => {
    expect(FREE_TRIAL_ROLLOUT_AT_DEFAULT).toBe('2026-10-11T00:00:00.000Z');
    expect(resolveFreeTrialRolloutAt(undefined)).toEqual(
      new Date('2026-10-11T00:00:00.000Z'),
    );
    expect(resolveFreeTrialRolloutAt('')).toEqual(
      new Date('2026-10-11T00:00:00.000Z'),
    );
    expect(resolveFreeTrialRolloutAt('not-a-date')).toEqual(
      new Date('2026-10-11T00:00:00.000Z'),
    );
    expect(resolveFreeTrialRolloutAt(' 2026-11-01T12:00:00Z ')).toEqual(
      new Date('2026-11-01T12:00:00.000Z'),
    );
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
    expect(isFreeTrialEmailTemplateKey('toString')).toBe(false);
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
