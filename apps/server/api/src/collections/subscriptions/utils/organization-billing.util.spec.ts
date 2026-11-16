import { buildOrganizationBillingRow } from '@api/collections/subscriptions/utils/organization-billing.util';
import { describe, expect, it } from 'vitest';

const organization = {
  id: 'org_1',
  label: 'Review org',
  ownerEmail: 'owner@example.com',
};

const subscription = {
  currentPeriodEnd: null,
  plan: 'monthly',
  status: 'active',
  stripeCustomerId: 'cus_1',
  stripePriceId: 'price_1',
  stripeSubscriptionId: 'sub_1',
};

describe('buildOrganizationBillingRow', () => {
  it('reads plan usage from the ledger, not from planLimit minus balance', () => {
    // 5,900 plan, 4,000 top-up, 1,500 spent: the balance is above the plan,
    // so a balance-derived figure would read as nothing used.
    const row = buildOrganizationBillingRow({
      balance: 8_400,
      cycleUsed: 1_500,
      hasPaygPurchase: false,
      organization,
      planLimit: 5_900,
      subscription,
      tier: 'pro',
    });

    expect(row.usedCredits).toBe(1_500);
    expect(row.usedPercent).toBeCloseTo(25.42, 2);
    expect(row.remainingPercent).toBeCloseTo(74.58, 2);
  });

  it('caps usage at the plan size and flags the plan as maxed out', () => {
    const row = buildOrganizationBillingRow({
      balance: 0,
      cycleUsed: 7_000,
      hasPaygPurchase: false,
      organization,
      planLimit: 5_900,
      subscription,
      tier: 'pro',
    });

    expect(row.usedCredits).toBe(5_900);
    expect(row.usedPercent).toBe(100);
    expect(row.isMaxedOut).toBe(true);
  });

  it('reports no usage for an organization without a plan grant', () => {
    const row = buildOrganizationBillingRow({
      balance: 400,
      cycleUsed: 250,
      hasPaygPurchase: false,
      organization,
      planLimit: 0,
      subscription: null,
      tier: null,
    });

    expect(row.usedCredits).toBe(0);
    expect(row.usedPercent).toBe(0);
    expect(row.isUnderUsing).toBe(false);
  });
});
