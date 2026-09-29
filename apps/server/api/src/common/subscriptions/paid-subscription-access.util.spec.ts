import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  type PaidSubscriptionSnapshot,
  resolveOrganizationPaidGrant,
} from './paid-subscription-access.util';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const FUTURE = '2026-10-27T12:00:00.000Z';

function subscription(
  overrides: Partial<PaidSubscriptionSnapshot> = {},
): PaidSubscriptionSnapshot {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: FUTURE,
    plan: 'monthly',
    status: SubscriptionStatus.ACTIVE,
    ...overrides,
  };
}

describe('resolveOrganizationPaidGrant', () => {
  it('does not grant a free or unset tier with no subscription row', () => {
    expect(resolveOrganizationPaidGrant([], SubscriptionTier.FREE, NOW)).toBe(
      null,
    );
    expect(resolveOrganizationPaidGrant([], null, NOW)).toBe(null);
  });

  it('keeps the existing per-row decision when subscription rows exist', () => {
    expect(
      resolveOrganizationPaidGrant(
        [subscription()],
        SubscriptionTier.FREE,
        NOW,
      ),
    ).toBe('active_paid');
    expect(
      resolveOrganizationPaidGrant(
        [
          subscription({
            cancelAtPeriodEnd: true,
            status: SubscriptionStatus.CANCELLED,
          }),
        ],
        null,
        NOW,
      ),
    ).toBe('paid_through');
    expect(
      resolveOrganizationPaidGrant(
        [subscription({ plan: null, status: SubscriptionStatus.ACTIVE })],
        SubscriptionTier.FREE,
        NOW,
      ),
    ).toBe(null);
  });
});
