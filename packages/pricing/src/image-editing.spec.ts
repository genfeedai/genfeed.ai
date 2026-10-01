import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import {
  FLUX_3_PROVIDER_COSTS,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { quoteModelBillablePricing } from './model-billable-quote';
import { applyMargin } from './plans-pricing';
import {
  buildStudioGenerationCostSettings,
  resolveStudioGenerationCost,
} from './studio-generation-cost';

const key = 'ideogram-ai/ideogram-4-5';
describe('image editing per-output funding', () => {
  it('quotes eight edited images as eight outputs in one request and conserves settlement credits', () => {
    const quote = quoteModelBillablePricing(
      {
        key,
        provider: 'replicate',
        isActive: true,
        isDeleted: false,
        isFree: false,
        cost: 20,
        providerCostUsd: 0.06,
        costPerUnit: null,
        minCost: null,
        pricingType: 'flat',
        reviewedPricing: null,
        rateVersion: null,
        requiresReviewedRates: false,
        requiredSelectorKeys: [],
        hasPendingRate: false,
      },
      {
        modelKey: key,
        provider: 'replicate',
        outputs: 8,
        requests: 1,
      },
      3.33,
      '2026-10-01T01:00:00.000Z',
    );
    expect(quote.status).toBe('priced');
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(quote.snapshot.providerCostUsd).toBe(0.48);
    expect(quote.snapshot.credits).toBe(160);
    expect(quote.snapshot.allocatedCredits).toEqual(Array(8).fill(20));
  });
  it('estimates every output, even though the provider batches them in one call', () => {
    const settings = buildStudioGenerationCostSettings('image-edit', {
      modelKey: key,
      outputs: 4,
    });
    const model = {
      key,
      provider: ModelProvider.REPLICATE,
      category: ModelCategory.IMAGE_EDIT,
      cost: 20,
      isActive: true,
    } as IModel;
    expect(
      resolveStudioGenerationCost({
        type: 'image-edit',
        settings,
        model,
        isLoadingModels: false,
      }),
    ).toEqual({ credits: 80, status: 'estimated' });
    expect(
      resolveStudioGenerationCost({
        type: 'image-edit',
        settings,
        model: { ...model, category: ModelCategory.IMAGE },
        isLoadingModels: false,
      }).status,
    ).toBe('unavailable');
  });
});

describe('FLUX.3 truthful Studio estimates', () => {
  it.each(Object.entries(FLUX_3_PROVIDER_COSTS))(
    'estimates native %s tier in generation and editing',
    (resolution, cost) => {
      for (const type of ['image', 'image-edit'] as const) {
        const modelKey =
          type === 'image'
            ? MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE
            : MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT;
        const model = {
          key: modelKey,
          provider: ModelProvider.REPLICATE,
          category:
            type === 'image' ? ModelCategory.IMAGE : ModelCategory.IMAGE_EDIT,
          cost: 8,
          isActive: true,
          reviewedProviderContractVersion: 'reviewed',
        } as IModel;
        const settings = buildStudioGenerationCostSettings(type, {
          modelKey,
          resolution,
        });
        expect(
          resolveStudioGenerationCost({
            type,
            settings,
            model,
            isLoadingModels: false,
          }),
        ).toEqual({ credits: applyMargin(cost), status: 'estimated' });
        expect(
          resolveStudioGenerationCost({
            type,
            settings: { ...settings, outputs: 2 },
            model,
            isLoadingModels: false,
          }).status,
        ).toBe('unavailable');
        expect(
          resolveStudioGenerationCost({
            type,
            settings,
            model: { ...model, reviewedProviderContractVersion: null },
            isLoadingModels: false,
          }).status,
        ).toBe('unavailable');
      }
    },
  );
});
