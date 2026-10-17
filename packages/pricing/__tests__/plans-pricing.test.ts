import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { CreditPackTier } from '@genfeedai/contracts/interfaces';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AVATAR_CREDIT_COSTS,
  applyMargin,
  avatarClipCreditRange,
  BASE_PROVIDER_COST_FRACTION,
  CREDIT_VALUE_DOLLARS,
  creditPackPrice,
  creditPackTotalCredits,
  creditsToOutputEstimate,
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  formatOutputs,
  formatPlanIncludedCredits,
  formatPlanMonthlyPrice,
  formatPlanPriceLabel,
  formatPrice,
  formatTierLabel,
  getEnterprisePlan,
  getPlanByLabel,
  getPlanByTier,
  getPlanLabel,
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
  VIDEO_CREDIT_COSTS,
  WEBSITE_CREDIT_PACKS,
  websitePlans,
} from '../src/plans-pricing';
import { REVIEWED_RATE_SHEET_ENTRIES } from '../src/reviewed-rates';

describe('plan lookups', () => {
  it('finds plans by label case-insensitively', () => {
    expect(getPlanByLabel('agencies')?.tier).toBe('scale');
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
    expect(getScalePlan().tier).toBe('scale');
    expect(getEnterprisePlan().tier).toBe('enterprise');
  });

  it('resolves display labels through getPlanLabel', () => {
    expect(getPlanLabel('payg')).toBe('Pay As You Go');
    expect(getPlanLabel('enterprise')).toBe('Enterprise');
  });

  it('lists exactly one plan per tier', () => {
    const tiers = websitePlans.map((plan) => plan.tier);

    expect(tiers).toEqual(['payg', 'scale', 'enterprise']);
  });
});

describe('plan price formatting', () => {
  it('formats compact price labels per tier', () => {
    expect(formatPlanPriceLabel('payg')).toBe('Free');
    expect(formatPlanPriceLabel('scale')).toBe('$499/mo');
    expect(formatPlanPriceLabel('enterprise')).toBe('Custom');
  });

  it('formats prose monthly prices per tier', () => {
    expect(formatPlanMonthlyPrice('payg')).toBe('free');
    expect(formatPlanMonthlyPrice('scale')).toBe('$499/month');
    expect(formatPlanMonthlyPrice('enterprise')).toBe('custom');
  });

  it('formats included credits per tier', () => {
    expect(formatPlanIncludedCredits('scale')).toBe('60,000 credits');
    expect(formatPlanIncludedCredits('payg')).toBe('');
    expect(formatPlanIncludedCredits('enterprise')).toBe('');
  });

  it('builds PLAN_COPY tokens from the same sources', () => {
    expect(PLAN_COPY.scale).toEqual({
      creditRateAdvantage: '~17%',
      includedCredits: '60,000 credits',
      includedCreditsValue: '$600',
      monthlyPrice: '$499/month',
      name: 'Agencies',
      nameWithPrice: 'Agencies ($499/month)',
      priceLabel: '$499/mo',
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
    for (const tier of ['scale'] as const) {
      const { includedCredits, price } = getPlanByTier(tier);

      expect(includedCredits).toBeTypeOf('number');
      expect(price).toBeTypeOf('number');

      const bonus =
        (Number(includedCredits) * CREDIT_VALUE_DOLLARS) / Number(price) - 1;
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

describe('applyMargin and runtime margin multiplier (generation)', () => {
  afterEach(() => {
    setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
  });

  it('applies the default 3.33× multiplier (70% margin) and converts to credits', () => {
    expect(applyMargin(0.15)).toBe(50);
    expect(applyMargin(0.5)).toBe(167);
    expect(applyMargin(0.04)).toBe(14);
  });

  it('scales by an explicit margin multiplier', () => {
    expect(applyMargin(0.15, 1.2)).toBe(18);
    expect(applyMargin(0.15, 1)).toBe(15);
  });

  it('enforces the 2-credit floor', () => {
    expect(applyMargin(0)).toBe(2);
    expect(applyMargin(0.0001)).toBe(2);
  });

  it('falls back to the 3.33 default for invalid multipliers', () => {
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
    expect(getRuntimeMarginMultiplier()).toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );

    setRuntimeMarginMultiplier(2);

    expect(getRuntimeMarginMultiplier()).toBe(2);
    expect(applyMargin(0.15)).toBe(30);
  });

  it('normalizes invalid runtime multipliers back to the 3.33 default', () => {
    setRuntimeMarginMultiplier(-1);
    expect(getRuntimeMarginMultiplier()).toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );

    setRuntimeMarginMultiplier(Number.NaN);
    expect(getRuntimeMarginMultiplier()).toBe(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
    );

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
    expect(INTERNAL_CREDIT_COSTS.voicePerMinute).toBe(17);
  });

  it('derives duration helpers from the per-second costs', () => {
    expect(VIDEO_CREDIT_COSTS.video4s).toBe(
      INTERNAL_CREDIT_COSTS.videoPerSecond * 4,
    );
    expect(VIDEO_CREDIT_COSTS.video15s).toBe(1125);
  });

  it('derives the avatar clip range from the reviewed HeyGen per-second rates', () => {
    const avatarEndpoints: readonly string[] = [
      MODEL_KEYS.HEYGEN_AVATAR,
      MODEL_KEYS.HEYGEN_AVATAR_IV,
      MODEL_KEYS.HEYGEN_AVATAR_V,
    ];
    const avatarRates = REVIEWED_RATE_SHEET_ENTRIES.filter(
      (entry) =>
        entry.provider === 'heygen' && avatarEndpoints.includes(entry.endpoint),
    ).flatMap((entry) => entry.rates.map((rate) => rate.unitPriceUsd));
    const clip = (usdPerSecond: number) =>
      applyMargin(usdPerSecond * 4, DEFAULT_GENERATION_MARGIN_MULTIPLIER);

    expect(AVATAR_CREDIT_COSTS.avatar4s).toEqual({
      maxCredits: clip(Math.max(...avatarRates)),
      minCredits: clip(Math.min(...avatarRates)),
    });
    // Photo animation $0.0385/s and Avatar V $0.12/s, 4 s at the 3.33 margin.
    expect(AVATAR_CREDIT_COSTS.avatar4s).toEqual({
      maxCredits: 160,
      minCredits: 52,
    });
    // An Avatar IV digital twin ($0.0805/s) falls inside the range.
    expect(clip(0.0805)).toBe(108);
  });

  it('scales an avatar clip with its length the way admission holds it', () => {
    expect(avatarClipCreditRange(10)).toEqual({
      maxCredits: 400,
      minCredits: 129,
    });
  });
});

describe('website plan catalogue', () => {
  it('publishes the three plans in presentation order', () => {
    expect(websitePlans.map((plan) => plan.label)).toEqual([
      'Pay As You Go',
      'Agencies',
      'Enterprise',
    ]);
    expect(websitePlans.map((plan) => plan.type)).toEqual([
      'payg',
      'subscription',
      'enterprise',
    ]);
    expect(websitePlans.map((plan) => plan.price)).toEqual([0, 499, null]);
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

  it('sells Agencies with client workspaces and the subscription features', () => {
    const scale = getScalePlan();

    expect(scale.interval).toBe('month');
    expect(scale.includedCredits).toBe(60_000);
    expect(scale.includedCredits).toBe(TIER_INCLUDED_MONTHLY_CREDITS.scale);
    expect(scale.features).toContain('Unlimited seats and client workspaces');
    expect(scale.features).toContain('Brand model training');
    expect(scale.features).toContain('API and BYOK');
    expect(scale.outputs).toBeNull();
  });

  it('leaves Enterprise outputs open for custom terms', () => {
    expect(getEnterprisePlan().outputs).toBeNull();
  });
});

describe('formatTierLabel', () => {
  it('names a plan tier by its display label', () => {
    expect(formatTierLabel('scale', 'a higher plan')).toBe('Agencies');
    expect(formatTierLabel('enterprise', 'a higher plan')).toBe('Enterprise');
  });

  it('capitalises an unknown tier and falls back when there is none', () => {
    expect(formatTierLabel('free', 'a higher plan')).toBe('Free');
    expect(formatTierLabel('constructor', 'a higher plan')).toBe('Constructor');
    expect(formatTierLabel(null, 'a paid plan')).toBe('a paid plan');
  });
});
