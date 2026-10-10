import { resolveLowCreditThreshold } from '@api/collections/credits/services/low-credit-threshold.util';
import { describe, expect, it } from 'vitest';

describe('resolveLowCreditThreshold', () => {
  it('uses one default image for a never-paid organization in its trial', () => {
    expect(
      resolveLowCreditThreshold({
        defaultImageCredits: 8,
        isTrialSubject: true,
        latestPaidGrantCredits: null,
      }),
    ).toBe(8);
  });

  it('never alerts a never-paid organization without a known image price', () => {
    expect(
      resolveLowCreditThreshold({
        defaultImageCredits: null,
        isTrialSubject: true,
        latestPaidGrantCredits: null,
      }),
    ).toBeNull();
  });

  it('uses 10% of the latest paid grant for a paying organization', () => {
    expect(
      resolveLowCreditThreshold({
        defaultImageCredits: 8,
        isTrialSubject: false,
        latestPaidGrantCredits: 10_000,
      }),
    ).toBe(1000);
  });

  it('never drops a paying organization below one default image', () => {
    expect(
      resolveLowCreditThreshold({
        defaultImageCredits: 30,
        isTrialSubject: false,
        latestPaidGrantCredits: 100,
      }),
    ).toBe(30);
  });

  it('rounds the allowance share up to a whole credit', () => {
    expect(
      resolveLowCreditThreshold({
        defaultImageCredits: null,
        isTrialSubject: false,
        latestPaidGrantCredits: 255,
      }),
    ).toBe(26);
  });

  it('returns null when neither a price nor a paid grant is known', () => {
    expect(
      resolveLowCreditThreshold({
        defaultImageCredits: 0,
        isTrialSubject: false,
        latestPaidGrantCredits: null,
      }),
    ).toBeNull();
  });
});
