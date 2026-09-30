import { PricingType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyMinCost,
  applyVideoResolutionCreditMultiplier,
  calculateDynamicImageCost,
  calculateDynamicVideoCost,
  calculateImageGenerationCredits,
  calculateMegapixelCost,
  calculatePerSecondCost,
  calculateVideoGenerationCredits,
  DEFAULT_GENERATION_HEIGHT,
  DEFAULT_GENERATION_WIDTH,
  doesImageProviderFanOutPerOutput,
  FALLBACK_GENERATION_CREDIT_COST,
  requestedOutputCount,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForFanOut,
  scaleCreditsForNonBatchOutputs,
  videoOutputCount,
} from './generation-credit-calculator';

describe('generation credit calculator', () => {
  describe('dimension and output defaults', () => {
    it('falls back to 1920x1080 when width or height is missing', () => {
      expect(resolveGenerationDimensions()).toEqual({
        height: DEFAULT_GENERATION_HEIGHT,
        width: DEFAULT_GENERATION_WIDTH,
      });
      expect(resolveGenerationDimensions(0, 0)).toEqual({
        height: DEFAULT_GENERATION_HEIGHT,
        width: DEFAULT_GENERATION_WIDTH,
      });
    });

    it('treats missing or zero outputs as a single billable output', () => {
      expect(requestedOutputCount(undefined)).toBe(1);
      expect(requestedOutputCount(0)).toBe(1);
      expect(requestedOutputCount('3')).toBe(3);
      expect(videoOutputCount(undefined)).toBe(1);
      expect(videoOutputCount(0)).toBe(1);
      expect(videoOutputCount(4)).toBe(4);
    });
  });

  describe('image fan-out', () => {
    it('fans out Fal always and Replicate only when the model is not batch-capable', () => {
      expect(doesImageProviderFanOutPerOutput('fal', true)).toBe(true);
      expect(doesImageProviderFanOutPerOutput('fal', false)).toBe(true);
      expect(doesImageProviderFanOutPerOutput('replicate', false)).toBe(true);
      expect(doesImageProviderFanOutPerOutput('replicate', true)).toBe(false);
      expect(doesImageProviderFanOutPerOutput('leonardo', false)).toBe(false);
      expect(doesImageProviderFanOutPerOutput(undefined, false)).toBe(false);
      expect(doesImageProviderFanOutPerOutput(null, false)).toBe(false);
    });

    it('multiplies only when the provider actually fans out extra outputs', () => {
      expect(scaleCreditsForFanOut(10, 3, true)).toBe(30);
      expect(scaleCreditsForFanOut(10, 1, true)).toBe(10);
      expect(scaleCreditsForFanOut(10, 3, false)).toBe(10);
    });
  });

  describe('video multipliers', () => {
    it('reserves the selected model and resolution band', () => {
      expect(
        applyVideoResolutionCreditMultiplier(10, 'provider/model', 'high'),
      ).toBe(20);
      expect(
        applyVideoResolutionCreditMultiplier(10, 'provider/model', '4k'),
      ).toBe(40);
      expect(
        applyVideoResolutionCreditMultiplier(
          10,
          'kwaivgi/kling-v3-omni-video',
          '4k',
        ),
      ).toBe(25);
      expect(
        applyVideoResolutionCreditMultiplier(10, 'provider/model', '720p'),
      ).toBe(10);
      expect(
        applyVideoResolutionCreditMultiplier(
          10,
          'fal/minimax/h3-max/text-to-video',
          '1080P',
        ),
      ).toBe(20);
    });

    it('multiplies non-batch video outputs and leaves batch models unscaled', () => {
      expect(scaleCreditsForNonBatchOutputs(10, 3, false)).toBe(30);
      expect(scaleCreditsForNonBatchOutputs(10, 3, true)).toBe(10);
      expect(scaleCreditsForNonBatchOutputs(10, 1, false)).toBe(10);
    });
  });

  describe('dynamic image cost', () => {
    it('uses flat cost when pricing type is missing', () => {
      expect(calculateDynamicImageCost({ cost: 7 }, 1920, 1080)).toBe(7);
    });

    it('bills megapixels when every per-megapixel input is present', () => {
      expect(
        calculateDynamicImageCost(
          {
            cost: 1,
            costPerUnit: 2,
            pricingType: PricingType.PER_MEGAPIXEL,
          },
          2000,
          1000,
        ),
      ).toBe(4);
    });

    it('falls back to flat cost when megapixel inputs are incomplete', () => {
      expect(
        calculateDynamicImageCost(
          {
            cost: 9,
            pricingType: PricingType.PER_MEGAPIXEL,
          },
          1920,
          1080,
        ),
      ).toBe(9);
    });

    it('applies minCost only when it is a positive floor', () => {
      expect(applyMinCost(3, 10)).toBe(10);
      expect(applyMinCost(12, 10)).toBe(12);
      expect(applyMinCost(3, 0)).toBe(3);
      expect(
        calculateDynamicImageCost(
          { cost: 2, minCost: 8, pricingType: PricingType.FLAT },
          1920,
          1080,
        ),
      ).toBe(8);
    });
  });

  describe('dynamic video cost', () => {
    it('prefers megapixel pricing over per-second when both could apply', () => {
      expect(
        calculateDynamicVideoCost(
          {
            cost: 1,
            costPerUnit: 2,
            pricingType: PricingType.PER_MEGAPIXEL,
          },
          2000,
          1000,
          12,
        ),
      ).toBe(4);
    });

    it('bills duration for per-second models', () => {
      expect(calculatePerSecondCost(5.2, 3)).toBe(16);
      expect(
        calculateDynamicVideoCost(
          {
            cost: 1,
            costPerUnit: 3,
            pricingType: PricingType.PER_SECOND,
          },
          1920,
          1080,
          5,
        ),
      ).toBe(15);
    });

    it('falls back to flat cost when duration is missing', () => {
      expect(
        calculateDynamicVideoCost(
          {
            cost: 11,
            costPerUnit: 3,
            pricingType: PricingType.PER_SECOND,
          },
          1920,
          1080,
          0,
        ),
      ).toBe(11);
    });
  });

  describe('missing model fallback', () => {
    it('charges the fallback amount when the catalog has no model row', () => {
      expect(
        resolveModelCreditCost(null, () => {
          throw new Error('priced path should not run');
        }),
      ).toBe(FALLBACK_GENERATION_CREDIT_COST);
      expect(
        resolveModelCreditCost({ cost: 12 }, (model) =>
          calculateDynamicImageCost(model, 1920, 1080),
        ),
      ).toBe(12);
    });
  });

  describe('megapixel arithmetic', () => {
    it('rounds partial megapixels up', () => {
      expect(calculateMegapixelCost(1920, 1080, 1)).toBe(3);
    });
  });

  describe('calculateImageGenerationCredits', () => {
    it('prices a flat model once when the provider batches natively', () => {
      expect(
        calculateImageGenerationCredits({
          height: 1024,
          imageProvider: 'replicate',
          isBatchSupported: true,
          modelKey: 'bytedance/seedream-4.5',
          outputs: 4,
          pricing: { cost: 6 },
          width: 1024,
        }),
      ).toEqual({
        billedOutputs: 1,
        credits: 6,
        dimensions: { height: 1024, width: 1024 },
        unitCredits: 6,
      });
    });

    it('fans out Fal outputs and prices non-square megapixels', () => {
      expect(
        calculateImageGenerationCredits({
          height: 1365,
          imageProvider: 'fal',
          isBatchSupported: false,
          modelKey: 'fal-ai/flux/dev',
          outputs: 3,
          pricing: {
            cost: 1,
            costPerUnit: 4,
            pricingType: PricingType.PER_MEGAPIXEL,
          },
          width: 1024,
        }),
      ).toEqual({
        billedOutputs: 3,
        credits: 18,
        dimensions: { height: 1365, width: 1024 },
        unitCredits: 6,
      });
    });

    it('floors the base at minCost before the quality band and keeps one credit', () => {
      expect(
        calculateImageGenerationCredits({
          height: 1024,
          imageProvider: 'replicate',
          isBatchSupported: false,
          modelKey: 'openai/gpt-image-2',
          outputs: 2,
          pricing: { cost: 2, minCost: 40 },
          quality: 'low',
          width: 1024,
        }),
      ).toMatchObject({ billedOutputs: 2, credits: 10, unitCredits: 5 });
      expect(
        calculateImageGenerationCredits({
          imageProvider: null,
          isBatchSupported: false,
          modelKey: 'provider/model',
          pricing: { cost: 0 },
        }),
      ).toMatchObject({ credits: 1, unitCredits: 1 });
    });

    it('charges the fallback rate when the catalog has no row', () => {
      expect(
        calculateImageGenerationCredits({
          imageProvider: 'replicate',
          isBatchSupported: false,
          modelKey: 'unknown/model',
          outputs: 2,
          pricing: null,
        }),
      ).toMatchObject({
        credits: FALLBACK_GENERATION_CREDIT_COST * 2,
        dimensions: {
          height: DEFAULT_GENERATION_HEIGHT,
          width: DEFAULT_GENERATION_WIDTH,
        },
      });
    });
  });

  describe('calculateVideoGenerationCredits', () => {
    const perSecond = {
      cost: 40,
      costPerUnit: 10,
      minCost: 50,
      pricingType: PricingType.PER_SECOND,
    };

    it('bills pilot and full durations from the same per-second rate', () => {
      expect(
        calculateVideoGenerationCredits({
          duration: 4,
          isBatchSupported: false,
          modelKey: 'google/veo-3.1-fast',
          pricing: perSecond,
        }),
      ).toMatchObject({ credits: 50, unitCredits: 50 });
      expect(
        calculateVideoGenerationCredits({
          duration: 8,
          isBatchSupported: false,
          modelKey: 'google/veo-3.1-fast',
          pricing: perSecond,
        }),
      ).toMatchObject({ credits: 80, unitCredits: 80 });
    });

    it('applies the resolution band and multiplies only non-batch outputs', () => {
      expect(
        calculateVideoGenerationCredits({
          duration: 5,
          isBatchSupported: false,
          modelKey: 'kwaivgi/kling-v3-video',
          outputs: 2,
          pricing: perSecond,
          resolution: 'pro',
        }),
      ).toEqual({
        billedOutputs: 2,
        credits: 134,
        dimensions: {
          height: DEFAULT_GENERATION_HEIGHT,
          width: DEFAULT_GENERATION_WIDTH,
        },
        unitCredits: 67,
      });
      expect(
        calculateVideoGenerationCredits({
          duration: 5,
          isBatchSupported: true,
          modelKey: 'provider/batch-video',
          outputs: 3,
          pricing: perSecond,
          resolution: '1080p',
        }),
      ).toMatchObject({ billedOutputs: 1, credits: 100, unitCredits: 100 });
    });

    it('prices non-square megapixel video and zero-cost rows without dividing by zero', () => {
      expect(
        calculateVideoGenerationCredits({
          duration: 8,
          height: 576,
          isBatchSupported: false,
          modelKey: 'provider/model',
          outputs: 2,
          pricing: {
            cost: 1,
            costPerUnit: 5,
            pricingType: PricingType.PER_MEGAPIXEL,
          },
          width: 1024,
        }),
      ).toMatchObject({ billedOutputs: 2, credits: 6, unitCredits: 3 });
      expect(
        calculateVideoGenerationCredits({
          isBatchSupported: false,
          modelKey: 'provider/model',
          outputs: 2,
          pricing: { cost: 0 },
        }),
      ).toEqual({
        billedOutputs: 1,
        credits: 0,
        dimensions: {
          height: DEFAULT_GENERATION_HEIGHT,
          width: DEFAULT_GENERATION_WIDTH,
        },
        unitCredits: 0,
      });
    });
  });
});
