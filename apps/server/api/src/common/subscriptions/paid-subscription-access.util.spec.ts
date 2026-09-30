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
  it('grants an operator-granted tier with no subscription row at all (#5293)', () => {
    for (const tier of [
      SubscriptionTier.PRO,
      SubscriptionTier.SCALE,
      SubscriptionTier.ENTERPRISE,
    ]) {
      expect(resolveOrganizationPaidGrant([], tier, NOW)).toBe('active_paid');
    }
  });

  it('does not grant a free or unset tier with no subscription row', () => {
    expect(resolveOrganizationPaidGrant([], SubscriptionTier.FREE, NOW)).toBe(
      null,
    );
    expect(resolveOrganizationPaidGrant([], null, NOW)).toBe(null);
  });

  it('denies the post-cancellation state — zero rows, tier already reset to free (adversarial check, #5293)', () => {
    // `StripeSubscriptionWebhookHandler.handleSubscriptionDeleted` soft-
    // deletes the row and resets `organizationSetting.subscriptionTier` to
    // `free` in the same handler, so a cancelled organization with no
    // surviving rows always reaches this function with a free tier, never a
    // stale paid one.
    expect(resolveOrganizationPaidGrant([], SubscriptionTier.FREE, NOW)).toBe(
      null,
    );
  });

  it('still denies a trial even when the tier reads paid, once a row exists', () => {
    // A real subscription row's own status governs once one exists — the
    // no-row fallback only applies when there is truly nothing to examine.
    expect(
      resolveOrganizationPaidGrant(
        [subscription({ status: SubscriptionStatus.TRIALING })],
        SubscriptionTier.PRO,
        NOW,
      ),
    ).toBe(null);
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
