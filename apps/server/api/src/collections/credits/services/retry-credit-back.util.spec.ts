import {
  decideRetryCreditBack,
  normalizeBriefPrompt,
  type RetryCreditBackInput,
} from '@api/collections/credits/services/retry-credit-back.util';
import {
  RETRY_CREDIT_BACK_DAILY_CAP_CREDITS,
  RETRY_CREDIT_BACK_RATE,
} from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const eligible: RetryCreditBackInput = {
  chargedCredits: 40,
  earnedInWindowCredits: 0,
  hasPriorAttempt: true,
  isDraft: false,
  isTrialSubject: false,
};

describe('decideRetryCreditBack', () => {
  it('returns a quarter of the retry price', () => {
    expect(RETRY_CREDIT_BACK_RATE).toBe(0.25);
    expect(decideRetryCreditBack(eligible)).toBe(10);
  });

  it('rounds down to whole credits and returns nothing below one', () => {
    expect(decideRetryCreditBack({ ...eligible, chargedCredits: 7 })).toBe(1);
    expect(decideRetryCreditBack({ ...eligible, chargedCredits: 3 })).toBe(0);
  });

  it.each([
    ['a draft retry', { isDraft: true }],
    ['a free-trial organization', { isTrialSubject: true }],
    ['a first attempt', { hasPriorAttempt: false }],
    ['a free generation', { chargedCredits: 0 }],
    ['a negative charge', { chargedCredits: -40 }],
    ['an unknown charge', { chargedCredits: Number.NaN }],
  ])('earns nothing for %s', (_label, override) => {
    expect(decideRetryCreditBack({ ...eligible, ...override })).toBe(0);
  });

  it('never pays past the daily cap', () => {
    const cap = RETRY_CREDIT_BACK_DAILY_CAP_CREDITS;
    expect(
      decideRetryCreditBack({
        ...eligible,
        chargedCredits: 400,
        earnedInWindowCredits: cap - 30,
      }),
    ).toBe(30);
    expect(
      decideRetryCreditBack({ ...eligible, earnedInWindowCredits: cap }),
    ).toBe(0);
    expect(
      decideRetryCreditBack({ ...eligible, earnedInWindowCredits: cap + 50 }),
    ).toBe(0);
  });

  it('is bounded by the price and by the cap for any charge and history', () => {
    for (const chargedCredits of [1, 4, 5, 99, 1000, 123456]) {
      for (const earnedInWindowCredits of [0, 1, 150, 199, 200, 400]) {
        const credits = decideRetryCreditBack({
          ...eligible,
          chargedCredits,
          earnedInWindowCredits,
        });
        expect(Number.isInteger(credits)).toBe(true);
        expect(credits).toBeGreaterThanOrEqual(0);
        expect(credits).toBeLessThanOrEqual(
          chargedCredits * RETRY_CREDIT_BACK_RATE,
        );
        expect(earnedInWindowCredits + credits).toBeLessThanOrEqual(
          Math.max(earnedInWindowCredits, RETRY_CREDIT_BACK_DAILY_CAP_CREDITS),
        );
      }
    }
  });
});

describe('normalizeBriefPrompt', () => {
  it('treats case and spacing differences as the same brief', () => {
    expect(normalizeBriefPrompt('  A Red\n  FOX  in snow ')).toBe(
      normalizeBriefPrompt('a red fox in snow'),
    );
  });

  it('keeps different words different', () => {
    expect(normalizeBriefPrompt('a red fox')).not.toBe(
      normalizeBriefPrompt('a blue fox'),
    );
  });
});
