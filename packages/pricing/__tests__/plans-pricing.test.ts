import type { CreditPackTier } from '@genfeedai/interfaces';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AVATAR_CREDIT_COSTS,
  applyMargin,
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
  PLAN_COPY,
  PLAN_LABELS,
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
    expect(formatPlanIncludedCredits('pro')).toBe('8,000 credits');
    expect(formatPlanIncludedCredits('scale')).toBe('80,000 credits');
    expect(formatPlanIncludedCredits('payg')).toBe('');
    expect(formatPlanIncludedCredits('enterprise')).toBe('');
  });

  it('builds PLAN_COPY tokens from the same sources', () => {
    expect(PLAN_COPY.pro).toEqual({
      includedCredits: '8,000 credits',
      monthlyPrice: '$49/month',
      name: 'Pro',
      nameWithPrice: 'Pro ($49/month)',
      priceLabel: '$49/mo',
    });
    expect(PLAN_COPY.enterprise.nameWithPrice).toBe('Enterprise (custom)');
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

    expect(proFeature).toContain('8,000 credits included monthly');
    expect(getProPlan().includedCredits).toBe(
      TIER_INCLUDED_MONTHLY_CREDITS.pro,
    );
  });

  it('keeps auxiliary offerings well-formed', () => {
    expect(dedicatedServerPlan.price).toBeNull();
    expect(contentServiceOffering.process.length).toBeGreaterThan(0);
    expect(TRAINING_PACKAGES.map((pkg) => pkg.priceLabel)).toEqual([
      '$299',
      '$499',
      '$999',
    ]);
  });
});
