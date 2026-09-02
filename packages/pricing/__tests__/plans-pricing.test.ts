import type { CreditPackTier } from '@genfeedai/contracts/interfaces';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AVATAR_CREDIT_COSTS,
  applyMargin,
  BASE_PROVIDER_COST_FRACTION,
  BYOK_CREDIT_VALUE_DOLLARS,
  BYOK_FEE_PER_CREDIT,
  BYOK_FEE_PERCENTAGE,
  contentServiceOffering,
  creditPackPrice,
  creditPackTotalCredits,
  creditsToOutputEstimate,
  dedicatedServerPlan,
  formatOutputs,
  formatPlanIncludedCredits,
  formatPlanLaunchPriceLabel,
  formatPlanMonthlyPrice,
  formatPlanPriceLabel,
  formatPrice,
  getEnterprisePlan,
  getPlanByLabel,
  getPlanByTier,
  getPlanLabel,
  getProPlan,
  getRuntimeMarginMultiplier,
  getScalePlan,
  INTERNAL_CREDIT_COSTS,
  MAX_MARGIN_MULTIPLIER,
  PAYG_CREDIT_PACKS,
  PAYG_CREDITS_PER_USD,
  PLAN_COPY,
  PLAN_LABELS,
  SUBSCRIPTION_PRICE_CONTRACTS,
  setRuntimeMarginMultiplier,
  TIER_INCLUDED_MONTHLY_CREDITS,
  TRAINING_PACKAGES,
  VIDEO_CREDIT_COSTS,
  WEBSITE_CREDIT_PACKS,
  websitePlans,
} from '../src/plans-pricing';

describe('plan lookups', () => {
  it('finds plans by label case-insensitively', () => {
    expect(getPlanByLabel('pro')?.tier).toBe('pro');
    expect(getPlanByLabel('PAY AS YOU GO')?.tier).toBe('payg');
    expect(getPlanByLabel('nonexistent')).toBeUndefined();
  });

  it('finds plans by tier and throws for a missing tier', () => {
    expect(getPlanByTier('scale').label).toBe(PLAN_LABELS.scale);
    const missingTier = 'missing' as unknown as Parameters<
      typeof getPlanByTier
    >[0];
    expect(() => getPlanByTier(missingTier)).toThrow(
      'Missing pricing plan for tier: missing',
    );
  });

  it('exposes tier-specific accessors', () => {
    expect(getProPlan().tier).toBe('pro');
    expect(getScalePlan().tier).toBe('scale');
    expect(getEnterprisePlan().tier).toBe('enterprise');
  });

  it('resolves display labels through getPlanLabel', () => {
    expect(getPlanLabel('payg')).toBe('Pay As You Go');
    expect(getPlanLabel('enterprise')).toBe('Enterprise');
  });

  it('lists exactly one plan per tier', () => {
    const tiers = websitePlans.map((plan) => plan.tier);

    expect(tiers).toEqual(['payg', 'pro', 'scale', 'enterprise']);
  });
});

describe('plan price formatting', () => {
  it('formats compact price labels per tier', () => {
    expect(formatPlanPriceLabel('payg')).toBe('Free');
    expect(formatPlanPriceLabel('pro')).toBe('$49/mo');
    expect(formatPlanPriceLabel('scale')).toBe('$499/mo');
    expect(formatPlanPriceLabel('enterprise')).toBe('Custom');
  });

  it('formats a launch price only for the tiers that carry one', () => {
    expect(formatPlanLaunchPriceLabel('pro')).toBe('$39/mo');
    expect(formatPlanLaunchPriceLabel('scale')).toBeNull();
    expect(formatPlanLaunchPriceLabel('payg')).toBeNull();
    expect(formatPlanLaunchPriceLabel('enterprise')).toBeNull();
  });

  it('formats prose monthly prices per tier', () => {
    expect(formatPlanMonthlyPrice('payg')).toBe('free');
    expect(formatPlanMonthlyPrice('pro')).toBe('$49/month');
    expect(formatPlanMonthlyPrice('enterprise')).toBe('custom');
  });

  it('formats included credits per tier', () => {
    expect(formatPlanIncludedCredits('pro')).toBe('5,900 credits');
    expect(formatPlanIncludedCredits('scale')).toBe('60,000 credits');
    expect(formatPlanIncludedCredits('payg')).toBe('');
    expect(formatPlanIncludedCredits('enterprise')).toBe('');
  });

  it('builds PLAN_COPY tokens from the same sources', () => {
    expect(PLAN_COPY.pro).toEqual({
      creditRateAdvantage: '~17%',
      includedCredits: '5,900 credits',
      includedCreditsValue: '$59',
      monthlyPrice: '$49/month',
      name: 'Pro',
      nameWithPrice: 'Pro ($49/month)',
      priceLabel: '$49/mo',
    });
    expect(PLAN_COPY.enterprise.nameWithPrice).toBe('Enterprise (custom)');
  });

  it('leaves derived credit-rate copy empty for tiers without a priced grant', () => {
    expect(PLAN_COPY.payg.creditRateAdvantage).toBe('');
    expect(PLAN_COPY.payg.includedCreditsValue).toBe('');
    expect(PLAN_COPY.enterprise.creditRateAdvantage).toBe('');
    expect(PLAN_COPY.enterprise.includedCreditsValue).toBe('');
  });

  it('prices every paid tier to the same credit bonus over the PAYG rate', () => {
    // The bonus and the margin are one dial: margin = 1 - 0.3 * (1 + bonus).
    // Holding both paid tiers at the same bonus holds them at the same margin.
    for (const tier of ['pro', 'scale'] as const) {
      const { includedCredits, price } = getPlanByTier(tier);

      expect(includedCredits).toBeTypeOf('number');
      expect(price).toBeTypeOf('number');

      const bonus =
        (Number(includedCredits) * BYOK_CREDIT_VALUE_DOLLARS) / Number(price) -
        1;
      const margin = 1 - BASE_PROVIDER_COST_FRACTION * (1 + bonus);

      expect(bonus).toBeGreaterThanOrEqual(0.18);
      expect(bonus).toBeLessThanOrEqual(0.22);
      expect(margin).toBeGreaterThanOrEqual(0.63);
    }
  });

  it('formats standalone prices', () => {
    expect(formatPrice(null)).toBe('Contact Sales');
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(1234)).toBe('$1,234');
  });
});

describe('formatOutputs', () => {
  it('returns null when no outputs are configured', () => {
    expect(formatOutputs(null)).toBeNull();
    expect(formatOutputs(undefined)).toBeNull();
  });

  it('joins present output quotas with a separator', () => {
    expect(
      formatOutputs({ images: 1000, videoMinutes: 10, voiceMinutes: 30 }),
    ).toBe('10 min video · 1,000 images · 30 min voice');
    expect(formatOutputs({ images: 500 })).toBe('500 images');
    expect(formatOutputs({})).toBe('');
  });
});

describe('applyMargin and runtime margin multiplier', () => {
  afterEach(() => {
    setRuntimeMarginMultiplier(1);
  });

  it('applies the base 70% margin and converts to credits', () => {
    expect(applyMargin(0.15)).toBe(50);
    expect(applyMargin(0.5)).toBe(167);
    expect(applyMargin(0.04)).toBe(14);
  });

  it('scales by an explicit margin multiplier', () => {
    expect(applyMargin(0.15, 1.2)).toBe(60);
  });

  it('enforces the 2-credit floor', () => {
    expect(applyMargin(0)).toBe(2);
    expect(applyMargin(0.0001)).toBe(2);
  });

  it('falls back to 1.0 for invalid multipliers', () => {
    expect(applyMargin(0.15, 0)).toBe(50);
    expect(applyMargin(0.15, -3)).toBe(50);
    expect(applyMargin(0.15, Number.NaN)).toBe(50);
    expect(applyMargin(0.15, Number.POSITIVE_INFINITY)).toBe(50);
  });

  it('clamps multipliers to MAX_MARGIN_MULTIPLIER', () => {
    expect(applyMargin(0.15, MAX_MARGIN_MULTIPLIER * 5)).toBe(
      applyMargin(0.15, MAX_MARGIN_MULTIPLIER),
    );
  });

  it('uses the process-scoped runtime multiplier by default', () => {
    expect(getRuntimeMarginMultiplier()).toBe(1);

    setRuntimeMarginMultiplier(2);

    expect(getRuntimeMarginMultiplier()).toBe(2);
    expect(applyMargin(0.15)).toBe(100);
  });

  it('normalizes invalid runtime multipliers back to 1.0', () => {
    setRuntimeMarginMultiplier(-1);
    expect(getRuntimeMarginMultiplier()).toBe(1);

    setRuntimeMarginMultiplier(Number.NaN);
    expect(getRuntimeMarginMultiplier()).toBe(1);

    setRuntimeMarginMultiplier(MAX_MARGIN_MULTIPLIER * 2);
    expect(getRuntimeMarginMultiplier()).toBe(MAX_MARGIN_MULTIPLIER);
  });
});

describe('credit packs', () => {
  it('exports the canonical PAYG credit conversion rate', () => {
    expect(PAYG_CREDITS_PER_USD).toBe(100);
  });

  it('computes total credits including bonus', () => {
    const pack: CreditPackTier = { bonus: 200, credits: 1000, label: '$10' };

    expect(creditPackTotalCredits(pack)).toBe(1200);
    expect(creditPackTotalCredits(PAYG_CREDIT_PACKS[0] as CreditPackTier)).toBe(
      1000,
    );
  });

  it('prices packs at 1 credit = $0.01', () => {
    expect(creditPackPrice({ bonus: null, credits: 1000, label: '$10' })).toBe(
      10,
    );
  });

  it('exposes a marketing subset of the PAYG packs', () => {
    expect(WEBSITE_CREDIT_PACKS.map((pack) => pack.label)).toEqual([
      '$10',
      '$100',
      '$1,000',
    ]);
    for (const pack of WEBSITE_CREDIT_PACKS) {
      expect(PAYG_CREDIT_PACKS).toContain(pack);
    }
  });
});

describe('creditsToOutputEstimate', () => {
  it('estimates rounded output volumes from credits', () => {
    expect(creditsToOutputEstimate(10_000)).toEqual({
      images: 200,
      videoMinutes: 2,
      voiceMinutes: 600,
    });
  });

  it('returns zeroes for zero credits', () => {
    expect(creditsToOutputEstimate(0)).toEqual({
      images: 0,
      videoMinutes: 0,
      voiceMinutes: 0,
    });
  });
});

describe('pricing constants', () => {
  it('publishes Stripe contracts by tier rather than product display name', () => {
    expect(SUBSCRIPTION_PRICE_CONTRACTS.pro).toEqual({
      currency: 'usd',
      includedMonthlyCredits: 5_900,
      interval: 'month',
      unitAmount: 4_900,
    });
    expect(SUBSCRIPTION_PRICE_CONTRACTS.scale).toEqual({
      currency: 'usd',
      includedMonthlyCredits: 60_000,
      interval: 'month',
      unitAmount: 49_900,
    });
  });

  it('prices every metered unit at its published credit cost', () => {
    expect(INTERNAL_CREDIT_COSTS.image).toBe(50);
    expect(INTERNAL_CREDIT_COSTS.image4k).toBe(100);
    expect(INTERNAL_CREDIT_COSTS.videoPerSecond).toBe(75);
    expect(INTERNAL_CREDIT_COSTS.avatarPerSecond).toBe(100);
    expect(INTERNAL_CREDIT_COSTS.voicePerMinute).toBe(17);
  });

  it('derives duration helpers from the per-second costs', () => {
    expect(VIDEO_CREDIT_COSTS.video4s).toBe(
      INTERNAL_CREDIT_COSTS.videoPerSecond * 4,
    );
    expect(VIDEO_CREDIT_COSTS.video15s).toBe(1125);
    expect(AVATAR_CREDIT_COSTS.avatar8s).toBe(
      INTERNAL_CREDIT_COSTS.avatarPerSecond * 8,
    );
  });

  it('derives the BYOK fee per credit from the fee percentage', () => {
    expect(BYOK_FEE_PER_CREDIT).toBeCloseTo(
      BYOK_CREDIT_VALUE_DOLLARS * (BYOK_FEE_PERCENTAGE / 100),
    );
  });

  it('embeds the included-credit grant into the subscription feature copy', () => {
    const proFeature = getProPlan().features[0];

    expect(proFeature).toContain('5,900 credits included monthly');
    expect(getProPlan().includedCredits).toBe(
      TIER_INCLUDED_MONTHLY_CREDITS.pro,
    );
  });

  it('keeps auxiliary offerings well-formed', () => {
    expect(dedicatedServerPlan.price).toBeNull();
    expect(dedicatedServerPlan.label).toBe('Dedicated');
    expect(dedicatedServerPlan.type).toBe('enterprise');
    expect(dedicatedServerPlan.outputs).toBeNull();
    expect(contentServiceOffering.process.length).toBeGreaterThan(0);
    expect(TRAINING_PACKAGES.map((pkg) => pkg.priceLabel)).toEqual([
      '$299',
      '$499',
      '$999',
    ]);
  });
});

describe('website plan catalogue', () => {
  it('publishes the four plans in presentation order', () => {
    expect(websitePlans.map((plan) => plan.label)).toEqual([
      'Pay As You Go',
      'Pro',
      'Scale',
      'Enterprise',
    ]);
    expect(websitePlans.map((plan) => plan.type)).toEqual([
      'payg',
      'subscription',
      'subscription',
      'enterprise',
    ]);
    expect(websitePlans.map((plan) => plan.price)).toEqual([0, 49, 499, null]);
  });

  it('labels every plan from PLAN_LABELS', () => {
    for (const plan of websitePlans) {
      expect(plan.label).toBe(PLAN_LABELS[plan.tier]);
      expect(getPlanLabel(plan.tier)).toBe(plan.label);
    }
  });

  it('sells pay-as-you-go for free with no included credits', () => {
    const payg = getPlanByTier('payg');

    expect(payg.price).toBe(0);
    expect(payg.outputs).toBeNull();
    expect(payg.includedCredits).toBeUndefined();
  });

  it('bills Pro monthly against an included credit grant', () => {
    const pro = getProPlan();

    expect(pro.interval).toBe('month');
    expect(pro.includedCredits).toBe(5_900);
    expect(pro.outputs).toBeNull();
  });

  it('sells Scale as multi-organization B2B with a shared credit pool', () => {
    const scale = getScalePlan();

    expect(scale.includedCredits).toBe(60_000);
    expect(scale.features).toContain(
      'Multiple organizations, one shared credit pool',
    );
    expect(scale.features).toContain('Unlimited brands and connected channels');
    expect(scale.outputs).toBeNull();
  });

  it('leaves Enterprise outputs open for custom terms', () => {
    expect(getEnterprisePlan().outputs).toBeNull();
  });
});

describe('launch pricing', () => {
  it('discounts Pro for the first 12 months', () => {
    const pro = getProPlan();

    expect(pro.launchPrice).toBe(39);
    expect(pro.launchNote).toBe('EARLYGENFEED · 12 months, then $49/mo');
  });

  it('promises no redemption cap in the launch note', () => {
    const note = getProPlan().launchNote?.toLowerCase() ?? '';

    expect(note).not.toMatch(/cap/);
    expect(note).not.toMatch(/limited/);
    expect(note).not.toMatch(/first \d+ (subscribers|customers|users)/);
  });

  it('offers launch pricing on Pro alone', () => {
    const discounted = websitePlans.filter((plan) => plan.launchPrice != null);

    expect(discounted.map((plan) => plan.tier)).toEqual(['pro']);
  });
});
