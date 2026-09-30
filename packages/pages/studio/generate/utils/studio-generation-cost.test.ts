import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import {
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import {
  calculateImageGenerationCredits,
  calculateVideoGenerationCredits,
} from '@genfeedai/pricing';
import {
  buildBaseGenerationPayload,
  buildImagePayload,
  buildVideoPayload,
} from '@pages/studio/generate/utils/generation-payloads';
import {
  buildStudioPromptData,
  getDefaultStudioGenerateSettings,
} from '@pages/studio/generate/utils/studio-generate-settings';
import { resolveStudioGenerationCost } from '@pages/studio/generate/utils/studio-generation-cost';
import { describe, expect, it } from 'vitest';

function catalogModel(overrides: Partial<IModel> = {}): IModel {
  return {
    id: 'model-1',
    createdAt: '',
    updatedAt: '',
    isDeleted: false,
    isActive: true,
    isDefault: false,
    lifecycle: ModelLifecycle.AVAILABLE,
    label: 'Imagen',
    key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
    category: ModelCategory.IMAGE,
    provider: ModelProvider.REPLICATE,
    cost: 7,
    ...overrides,
  };
}

const imageSettings = getDefaultStudioGenerateSettings('image');
const videoSettings = getDefaultStudioGenerateSettings('video');

describe('resolveStudioGenerationCost', () => {
  it.each([
    [
      ModelProvider.REPLICATE,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      PricingType.FLAT,
      '1K',
      '1:1',
      3,
    ],
    [
      ModelProvider.REPLICATE,
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
      PricingType.PER_MEGAPIXEL,
      '2K',
      '9:16',
      4,
    ],
    [
      ModelProvider.FAL,
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
      PricingType.PER_MEGAPIXEL,
      '2K',
      '16:9',
      4,
    ],
    [
      ModelProvider.REPLICATE,
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
      PricingType.FLAT,
      '2K',
      '4:5',
      2,
    ],
  ])(
    'matches image submission/calculator for %s %s %s %s %s %s',
    (provider, key, pricingType, resolution, aspectRatio, outputs) => {
      const model = catalogModel({
        provider,
        key,
        pricingType,
        costPerUnit: 8,
        minCost: 2,
        isBatchSupported: true,
      });
      const settings = {
        ...imageSettings,
        modelKey: key,
        resolution,
        aspectRatio,
        outputs,
      };
      const promptData = buildStudioPromptData({
        brandId: 'brand-1',
        promptText: 'A product',
        settings,
        type: 'image',
      });
      const payload = buildImagePayload(
        buildBaseGenerationPayload(promptData, key, 'brand-1'),
        promptData,
      );
      const expected = calculateImageGenerationCredits({
        ...payload,
        imageProvider: provider,
        isBatchSupported:
          MODEL_OUTPUT_CAPABILITIES[key]?.isBatchSupported ?? false,
        modelKey: key,
        pricing: model,
      }).credits;
      expect(
        resolveStudioGenerationCost({
          isLoadingModels: false,
          model,
          settings,
          type: 'image',
        }),
      ).toEqual({ credits: expected, status: 'estimated' });
    },
  );

  it.each([
    [PricingType.PER_SECOND, 'standard', 5, 1],
    [PricingType.PER_SECOND, '4k', 10, 3],
    [PricingType.PER_MEGAPIXEL, '1080p', 8, 2],
    [PricingType.FLAT, 'unsupported-stale-resolution', 5, 2],
  ])(
    'matches effective video submission for %s %s %s %s',
    (pricingType, resolution, duration, outputs) => {
      const key = MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO;
      const model = catalogModel({
        key,
        category: ModelCategory.VIDEO,
        pricingType,
        costPerUnit: 10,
        minCost: 10,
        isBatchSupported: true,
      });
      const settings = {
        ...videoSettings,
        modelKey: key,
        resolution,
        duration,
        outputs,
      };
      const promptData = buildStudioPromptData({
        brandId: 'brand-1',
        promptText: 'A reveal',
        settings,
        type: 'video',
      });
      const payload = buildVideoPayload(
        buildBaseGenerationPayload(promptData, key, 'brand-1'),
        promptData,
      );
      const expected = calculateVideoGenerationCredits({
        ...payload,
        isBatchSupported:
          MODEL_OUTPUT_CAPABILITIES[key]?.isBatchSupported ?? false,
        modelKey: key,
        pricing: model,
      }).credits;
      expect(
        resolveStudioGenerationCost({
          isLoadingModels: false,
          model,
          settings,
          type: 'video',
        }),
      ).toEqual({ credits: expected, status: 'estimated' });
    },
  );

  it('preserves native video batch semantics when the registry supports them', () => {
    const key = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5;
    const previous = MODEL_OUTPUT_CAPABILITIES[key];
    MODEL_OUTPUT_CAPABILITIES[key] = { ...previous, isBatchSupported: true };
    try {
      const model = catalogModel({
        key,
        category: ModelCategory.VIDEO,
        cost: 7,
        isBatchSupported: false,
      });
      const settings = {
        ...videoSettings,
        modelKey: key,
        resolution: '720p',
        outputs: 4,
      };
      expect(
        resolveStudioGenerationCost({
          isLoadingModels: false,
          model,
          settings,
          type: 'video',
        }),
      ).toEqual({ credits: 7, status: 'estimated' });
    } finally {
      MODEL_OUTPUT_CAPABILITIES[key] = previous;
    }
  });

  it('keeps loading, Auto and unavailable distinct', () => {
    expect(
      resolveStudioGenerationCost({
        isLoadingModels: true,
        settings: imageSettings,
        type: 'image',
      }),
    ).toEqual({ credits: null, status: 'loading' });
    for (const modelKey of ['', 'auto', '__auto_model__']) {
      expect(
        resolveStudioGenerationCost({
          isLoadingModels: false,
          settings: { ...imageSettings, modelKey },
          type: 'image',
        }),
      ).toEqual({ credits: null, status: 'auto' });
    }
    expect(
      resolveStudioGenerationCost({
        isLoadingModels: false,
        settings: { ...imageSettings, modelKey: 'missing' },
        type: 'image',
      }),
    ).toEqual({ credits: null, status: 'unavailable' });
  });

  it.each<Partial<IModel>>([
    { cost: 0 },
    { cost: 0, isFree: true, pricingType: PricingType.PER_MEGAPIXEL },
    { cost: Number.NaN },
    { cost: Number.POSITIVE_INFINITY },
    { minCost: Number.NaN },
    { costPerUnit: Number.POSITIVE_INFINITY },
    { pricingType: PricingType.PER_MEGAPIXEL },
    { pricingType: PricingType.PER_MEGAPIXEL, costPerUnit: 0 },
    { pricingType: PricingType.PER_SECOND, costPerUnit: 4 },
    { pricingType: 'per-token' as PricingType },
    { reviewStatus: 'pending' },
    { reviewStatus: 'rejected' },
    { pendingProviderContractVersion: 'v2' },
    { providerSyncStatus: 'quarantined' },
    { providerSyncStatus: 'review_required' },
    { isActive: false },
    { lifecycle: ModelLifecycle.RETIRED },
    { category: ModelCategory.TEXT },
    { provider: ModelProvider.GENFEED_AI },
    { isFree: true, cost: 0, minCost: 1 },
  ])('rejects incomplete/unsupported catalog evidence %j', (patch) => {
    const model = catalogModel(patch);
    expect(
      resolveStudioGenerationCost({
        isLoadingModels: false,
        model,
        settings: { ...imageSettings, modelKey: model.key },
        type: 'image',
      }),
    ).toEqual({ credits: null, status: 'unavailable' });
  });

  it('shows zero only for an explicitly free model with a zero tariff', () => {
    const model = catalogModel({
      isFree: true,
      cost: 0,
      costPerUnit: 0,
      minCost: 0,
    });
    expect(
      resolveStudioGenerationCost({
        isLoadingModels: false,
        model,
        settings: { ...imageSettings, modelKey: model.key },
        type: 'image',
      }),
    ).toEqual({ credits: 0, status: 'estimated' });
  });

  it('does not estimate a per-second video without a duration or unsupported asset types', () => {
    const model = catalogModel({
      category: ModelCategory.VIDEO,
      key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      pricingType: PricingType.PER_SECOND,
      costPerUnit: 10,
    });
    expect(
      resolveStudioGenerationCost({
        isLoadingModels: false,
        model,
        settings: {
          ...videoSettings,
          modelKey: model.key,
          duration: undefined,
        },
        type: 'video',
      }),
    ).toEqual({ credits: null, status: 'unavailable' });
    expect(
      resolveStudioGenerationCost({
        isLoadingModels: false,
        model,
        settings: videoSettings,
        type: 'music',
      }),
    ).toEqual({ credits: null, status: 'unavailable' });
  });
});
