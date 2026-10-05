import type {
  ModelBillablePricingProfile,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  classifyModelPricingAttention,
  enumerateReviewedVariantSelectors,
  isModelPricingRed,
  type ModelPricingAttentionInput,
} from './model-pricing-attention';

const now = new Date('2026-10-05T00:00:00Z');
const hailuoRates: ReviewedProviderRate[] = [
  {
    component: 'video_output_count',
    unit: 'output',
    unitPriceUsd: 0.19,
    when: { resolution: '768P', duration: 6 },
  },
  {
    component: 'video_output_count',
    unit: 'output',
    unitPriceUsd: 0.32,
    when: { resolution: '768P', duration: 10 },
  },
  {
    component: 'video_output_count',
    unit: 'output',
    unitPriceUsd: 0.33,
    when: { resolution: '1080P', duration: 6 },
  },
];
const profile: ModelBillablePricingProfile = {
  cost: 0,
  costPerUnit: null,
  hasPendingRate: false,
  isActive: true,
  isDeleted: false,
  isFree: false,
  key: 'minimax/hailuo-2.3-fast',
  minCost: null,
  pricingType: 'flat',
  provider: 'replicate',
  providerCostUsd: null,
  rateVersion: 'rates:sha256:a',
  requiredSelectorKeys: ['resolution'],
  requiresReviewedRates: true,
  reviewedPricing: {
    currency: 'USD',
    rates: hailuoRates,
    reviewStatus: 'approved',
    sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
    verifiedAt: '2026-06-01T00:00:00Z',
    version: 'rates:sha256:a',
    invariantSelectors: ['duration'],
  },
};
const base: ModelPricingAttentionInput = {
  category: 'video',
  isActive: true,
  isFree: false,
  now,
  profile,
  provider: 'replicate',
};

describe('classifyModelPricingAttention', () => {
  it('needs nothing from a reviewed model whose every variant prices, however old the verification', () => {
    expect(classifyModelPricingAttention(base)).toEqual([]);
  });

  it('is red when a variant model has no reviewed rates', () => {
    const attention = classifyModelPricingAttention({
      ...base,
      profile: { ...profile, reviewedPricing: null, rateVersion: null },
    });
    expect(attention).toMatchObject([{ code: 'price_missing', level: 'red' }]);
    expect(isModelPricingRed(attention)).toBe(true);
  });

  it('is red for a paid model that resolves to zero credits, but not for an explicit free one', () => {
    const flat: ModelBillablePricingProfile = {
      ...profile,
      cost: 0,
      isFree: false,
      pricingType: 'flat',
      providerCostUsd: null,
      requiredSelectorKeys: [],
      requiresReviewedRates: false,
      reviewedPricing: null,
      rateVersion: null,
    };
    expect(
      classifyModelPricingAttention({ ...base, profile: flat }),
    ).toMatchObject([{ level: 'red' }]);
    expect(
      classifyModelPricingAttention({
        ...base,
        isFree: true,
        profile: { ...flat, isFree: true },
      }),
    ).toEqual([]);
  });

  it('is red when a declared variant cannot be priced', () => {
    const attention = classifyModelPricingAttention({
      ...base,
      profile: {
        ...profile,
        requiredSelectorKeys: ['resolution', 'mode'],
      },
    });
    expect(attention).toMatchObject([{ code: 'unpriceable', level: 'red' }]);
  });

  it('is orange while a price change awaits approval, still pricing', () => {
    const attention = classifyModelPricingAttention({
      ...base,
      profile: { ...profile, hasPendingRate: true },
    });
    expect(attention).toMatchObject([
      { code: 'price_change_pending', level: 'orange' },
    ]);
    expect(isModelPricingRed(attention)).toBe(false);
  });

  it('is orange when a refresh failed or went stale, and lists red before orange', () => {
    expect(
      classifyModelPricingAttention({
        ...base,
        providerSyncFailureCode: 'rate_unmapped',
        providerSyncStatus: 'failed',
      }),
    ).toMatchObject([{ code: 'refresh_failed', level: 'orange' }]);
    expect(
      classifyModelPricingAttention({
        ...base,
        providerPricingSyncedAt: '2026-09-20T00:00:00Z',
      }),
    ).toMatchObject([{ code: 'refresh_stale', level: 'orange' }]);
    expect(
      classifyModelPricingAttention({
        ...base,
        providerPricingSyncedAt: '2026-10-01T00:00:00Z',
      }),
    ).toEqual([]);
    const mixed = classifyModelPricingAttention({
      ...base,
      profile: {
        ...profile,
        hasPendingRate: true,
        requiredSelectorKeys: ['resolution', 'mode'],
      },
    });
    expect(mixed.map((item) => item.level)).toEqual(['red', 'orange']);
  });

  it('ignores inactive models', () => {
    expect(
      classifyModelPricingAttention({
        ...base,
        isActive: false,
        profile: { ...profile, reviewedPricing: null },
      }),
    ).toEqual([]);
  });

  it('accepts token-metered text without a reviewed contract', () => {
    expect(
      classifyModelPricingAttention({
        ...base,
        category: 'text',
        hasTokenPricing: true,
        profile: { ...profile, reviewedPricing: null, rateVersion: null },
      }),
    ).toEqual([]);
  });
});

describe('numeric-string duration bands', () => {
  it('samples a "10" band at ten seconds, not the default', () => {
    const tenSecondRates: ReviewedProviderRate[] = [
      {
        component: 'output',
        isPerOutput: true,
        unit: 'second',
        unitPriceUsd: 0.1,
        when: { duration: '10' },
      },
    ];
    const attention = classifyModelPricingAttention({
      ...base,
      profile: {
        ...profile,
        requiredSelectorKeys: [],
        reviewedPricing: {
          ...(profile.reviewedPricing as NonNullable<
            typeof profile.reviewedPricing
          >),
          rates: tenSecondRates,
        },
      },
    });
    // Priced (not unresolved for a missing duration) at the band's own seconds.
    expect(attention).toEqual([]);
  });
});

describe('selector merging across components', () => {
  it('treats duration 6 and "6" as the same value when merging components', () => {
    expect(
      enumerateReviewedVariantSelectors([
        {
          component: 'output',
          unit: 'output',
          unitPriceUsd: 0.1,
          when: { duration: 6 },
        },
        {
          component: 'extras',
          unit: 'reference',
          unitPriceUsd: 0.01,
          when: { duration: '6', mode: 'pro' },
        },
      ]),
    ).toHaveLength(1);
  });
});

describe('enumerateReviewedVariantSelectors', () => {
  it('lists each declared variant once and merges independent components', () => {
    expect(enumerateReviewedVariantSelectors(hailuoRates)).toHaveLength(3);
    const merged = enumerateReviewedVariantSelectors([
      ...hailuoRates.slice(0, 1),
      {
        component: 'references',
        unit: 'reference',
        unitPriceUsd: 0.01,
        when: {},
      },
    ]);
    expect(merged).toEqual([{ resolution: '768P', duration: 6 }]);
  });
});
