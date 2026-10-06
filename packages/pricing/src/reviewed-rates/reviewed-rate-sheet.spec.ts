import { ModelCategory } from '@genfeedai/contracts';
import {
  FLUX_3_PROVIDER_COSTS,
  UNIFIED_MODEL_CATALOG,
} from '@genfeedai/contracts/constants';
import type { ModelBillablePricingProfile } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { classifyModelPricingAttention } from '../model-pricing-attention';
import { hashReviewedProviderRates } from '../reviewed-rate-hash';
import {
  findReviewedRateSheetEntry,
  REVIEWED_RATE_SHEET_ENTRIES,
  UNPRICED_MODELS,
} from './index';

function profileFor(
  entry: (typeof REVIEWED_RATE_SHEET_ENTRIES)[number],
): ModelBillablePricingProfile {
  const version = hashReviewedProviderRates(entry.rates);
  return {
    cost: 0,
    costPerUnit: null,
    hasPendingRate: false,
    isActive: true,
    isDeleted: false,
    isFree: false,
    key: entry.endpoint,
    minCost: null,
    pricingType: 'flat',
    provider: entry.provider,
    providerCostUsd: null,
    rateVersion: version,
    requiredSelectorKeys: [],
    requiresReviewedRates: true,
    reviewedPricing: {
      currency: 'USD',
      invariantSelectors: entry.invariantSelectors,
      rates: [...entry.rates],
      reviewStatus: 'approved',
      sourceUrl: entry.sourceUrl,
      verifiedAt: entry.verifiedAt,
      version,
    },
  };
}

describe('reviewed rate sheet', () => {
  it('has one valid public-price entry per provider endpoint', () => {
    const seen = new Set<string>();
    for (const entry of REVIEWED_RATE_SHEET_ENTRIES) {
      const id = `${entry.provider}:${entry.endpoint}`;
      expect(seen.has(id), `duplicate ${id}`).toBe(false);
      seen.add(id);
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(Number.isFinite(Date.parse(entry.verifiedAt))).toBe(true);
      expect(entry.rates.length).toBeGreaterThan(0);
      for (const rate of entry.rates) {
        expect(rate.unitPriceUsd, id).toBeGreaterThan(0);
        // Public list prices only: no margin or commercial fields.
        expect(Object.keys(rate).sort()).not.toContain('margin');
      }
    }
  });

  it('prices every declared variant of every entry', () => {
    const now = new Date(
      Math.max(
        ...REVIEWED_RATE_SHEET_ENTRIES.map((entry) =>
          Date.parse(entry.verifiedAt),
        ),
      ),
    );
    for (const entry of REVIEWED_RATE_SHEET_ENTRIES)
      expect(
        classifyModelPricingAttention({
          category: entry.rates.every((rate) => rate.unit.endsWith('-token'))
            ? ModelCategory.TEXT
            : ModelCategory.VIDEO,
          hasTokenPricing: entry.rates.every((rate) =>
            rate.unit.endsWith('-token'),
          ),
          isActive: true,
          isFree: false,
          margin: 3.33,
          now,
          profile: profileFor(entry),
          provider: entry.provider,
        }),
        entry.endpoint,
      ).toEqual([]);
  });

  it('keeps FLUX.3 in step with the Studio estimate constants', () => {
    const entry = findReviewedRateSheetEntry(
      'replicate',
      'black-forest-labs/flux-3-image',
    );
    expect(
      Object.fromEntries(
        (entry?.rates ?? []).map((rate) => [
          rate.when.resolution,
          rate.unitPriceUsd,
        ]),
      ),
    ).toEqual(FLUX_3_PROVIDER_COSTS);
  });

  it('covers every active paid catalog model with an entry or an explicit unpriced reason', () => {
    const uncovered: string[] = [];
    for (const model of UNIFIED_MODEL_CATALOG) {
      // Chat models settle on actual token usage from per-million rates.
      if (
        !model.isActive ||
        model.isFree ||
        model.category === ModelCategory.TEXT
      )
        continue;
      const endpoint = model.endpoint ?? model.key;
      const hasEntry = Boolean(
        findReviewedRateSheetEntry(model.provider, endpoint),
      );
      if (!hasEntry && !UNPRICED_MODELS[model.key]) uncovered.push(model.key);
    }
    expect(uncovered).toEqual([]);
  });

  it('never lists a model as both priced and unpriced', () => {
    for (const entry of REVIEWED_RATE_SHEET_ENTRIES)
      expect(UNPRICED_MODELS[entry.endpoint], entry.endpoint).toBeUndefined();
  });
});
