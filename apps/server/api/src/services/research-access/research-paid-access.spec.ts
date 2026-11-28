import type { PaidSubscriptionSnapshot } from '@api/common/subscriptions/paid-subscription-access.util';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  resolveResearchCollectionAccess,
  resolveResearchScanTier,
} from './research-paid-access';

const NOW = new Date('2026-09-24T12:00:00.000Z');
const FUTURE = '2026-10-24T12:00:00.000Z';
const PAST = '2026-08-24T12:00:00.000Z';

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

describe('resolveResearchCollectionAccess', () => {
  it('allows self-hosted collection without a subscription', () => {
    expect(
      resolveResearchCollectionAccess({
        isHostedSaas: false,
        now: NOW,
        subscriptionReadFailed: false,
        subscriptionTier: null,
        subscriptions: [],
      }),
    ).toEqual({ isAllowed: true, reason: 'self_hosted' });
  });

  it('fails closed when the hosted subscription read fails', () => {
    expect(
      resolveResearchCollectionAccess({
        isHostedSaas: true,
        now: NOW,
        subscriptionReadFailed: true,
        subscriptionTier: SubscriptionTier.SCALE,
        subscriptions: [subscription()],
      }).reason,
    ).toBe('research_subscription_unverified');
  });

  it('allows an active paid plan and a cancellation still inside the paid period', () => {
    expect(
      resolveResearchCollectionAccess({
        isHostedSaas: true,
        now: NOW,
        subscriptionReadFailed: false,
        subscriptionTier: SubscriptionTier.SCALE,
        subscriptions: [subscription()],
      }).reason,
    ).toBe('active_paid');
    expect(
      resolveResearchCollectionAccess({
        isHostedSaas: true,
        now: NOW,
        subscriptionReadFailed: false,
        subscriptionTier: SubscriptionTier.SCALE,
        subscriptions: [
          subscription({
            cancelAtPeriodEnd: true,
            status: SubscriptionStatus.CANCELLED,
          }),
        ],
      }).reason,
    ).toBe('paid_through');
  });

  it('denies trials, free-tier, API-key-only orgs, and expired or unpaid rows', () => {
    const denied = [
      subscription({ status: SubscriptionStatus.TRIALING }),
      subscription({ plan: null, status: SubscriptionStatus.ACTIVE }),
      subscription({
        plan: null,
        status: SubscriptionStatus.ACTIVE,
      }),
      subscription({ status: SubscriptionStatus.PAST_DUE }),
      subscription({ currentPeriodEnd: PAST }),
      subscription({ currentPeriodEnd: null }),
    ];
    for (const row of denied) {
      expect(
        resolveResearchCollectionAccess({
          isHostedSaas: true,
          now: NOW,
          subscriptionReadFailed: false,
          subscriptionTier:
            row.status === SubscriptionStatus.TRIALING
              ? SubscriptionTier.SCALE
              : SubscriptionTier.FREE,
          subscriptions: [row],
        }).isAllowed,
      ).toBe(false);
    }
    expect(
      resolveResearchCollectionAccess({
        isHostedSaas: true,
        now: NOW,
        subscriptionReadFailed: false,
        subscriptionTier: SubscriptionTier.FREE,
        subscriptions: [],
      }).reason,
    ).toBe('research_paid_access_required');
  });

  it('does not let a free tier override a paid plan on the subscription row', () => {
    expect(
      resolveResearchCollectionAccess({
        isHostedSaas: true,
        now: NOW,
        subscriptionReadFailed: false,
        subscriptionTier: SubscriptionTier.FREE,
        subscriptions: [subscription({ plan: 'yearly' })],
      }),
    ).toEqual({ isAllowed: true, reason: 'active_paid' });
  });
});

describe('resolveResearchScanTier', () => {
  const paid = { isAllowed: true, reason: 'active_paid' } as const;
  const unpaid = {
    isAllowed: false,
    reason: 'research_paid_access_required',
  } as const;

  it('uses the organization paid tier', () => {
    expect(resolveResearchScanTier(paid, SubscriptionTier.SCALE)).toBe(
      SubscriptionTier.SCALE,
    );
    expect(resolveResearchScanTier(paid, SubscriptionTier.ENTERPRISE)).toBe(
      SubscriptionTier.ENTERPRISE,
    );
  });

  it('gives a paying organization whose tier reads free the Pro limit', () => {
    expect(resolveResearchScanTier(paid, SubscriptionTier.FREE)).toBe(
      SubscriptionTier.PRO,
    );
    expect(resolveResearchScanTier(paid, null)).toBe(SubscriptionTier.PRO);
  });

  it('gives an organization without a plan the free tier whatever its tier says', () => {
    expect(resolveResearchScanTier(unpaid, SubscriptionTier.SCALE)).toBe(
      SubscriptionTier.FREE,
    );
  });
});
