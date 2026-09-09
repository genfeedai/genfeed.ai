import { describe, expect, it } from 'vitest';
import {
  isLongGeneration,
  isPurchasedCredit,
} from './email-product-signals.policy';

describe('generation email eligibility', () => {
  it('requires known start and completion with at least two minutes elapsed', () => {
    const start = new Date('2026-09-09T09:00:00Z');
    expect(isLongGeneration(start, new Date('2026-09-09T09:02:00Z'))).toBe(
      true,
    );
    expect(isLongGeneration(start, new Date('2026-09-09T09:01:59Z'))).toBe(
      false,
    );
    expect(isLongGeneration(null, start)).toBe(false);
    expect(isLongGeneration(start, null)).toBe(false);
    expect(isLongGeneration(start, new Date('invalid'))).toBe(false);
  });
});

describe('credit purchase evidence', () => {
  it('excludes bonus, refunds and subscription grants from purchase conversion', () => {
    expect(
      isPurchasedCredit({
        referenceType: 'stripe-checkout-session:user-credit',
        referenceId: 'cs_123',
      }),
    ).toBe(true);
    expect(
      isPurchasedCredit({
        referenceType: 'stripe-invoice',
        referenceId: 'in_123',
      }),
    ).toBe(false);
    expect(
      isPurchasedCredit({ referenceType: 'bonus', referenceId: 'bonus_123' }),
    ).toBe(false);
    expect(
      isPurchasedCredit({
        referenceType: 'stripe-checkout-session:user-credit',
        referenceId: null,
      }),
    ).toBe(false);
  });
});
