import { PricingType } from '@genfeedai/contracts';

import {
  applyMinCost,
  applyVideoResolutionCreditMultiplier,
  calculateDynamicImageCost,
  calculateDynamicVideoCost,
  calculateMegapixelCost,
  calculatePerSecondCost,
  commitDeferredCredits,
  DEFAULT_GENERATION_HEIGHT,
  DEFAULT_GENERATION_WIDTH,
  doesImageProviderFanOutPerOutput,
  FALLBACK_GENERATION_CREDIT_COST,
  isDeferredCreditsRequest,
  requestedOutputCount,
  resolveGenerationDimensions,
  resolveModelCreditCost,
  scaleCreditsForFanOut,
  scaleCreditsForNonBatchOutputs,
  videoOutputCount,
} from './generation-credit-cost.util';

describe('generation credit cost helpers', () => {
  describe('deferred request guards', () => {
    it('ignores requests without deferred credit metadata', () => {
      expect(isDeferredCreditsRequest({})).toBe(false);
      expect(
        isDeferredCreditsRequest({ creditsConfig: { deferred: false } }),
      ).toBe(false);
    });

    it('commits the resolved amount and clears the deferred flag', () => {
      const request = {
        creditsConfig: { amount: 1, deferred: true },
      };

      commitDeferredCredits(request, 40, 'provider/model');

      expect(request.creditsConfig).toEqual({
        amount: 40,
        deferred: false,
        modelKey: 'provider/model',
      });
    });

    it('stores the pricing audit stamp when supplied', () => {
      const request = {
        creditsConfig: { amount: 1, deferred: true },
      };

      commitDeferredCredits(request, 40, 'provider/model', {
        marginMultiplier: 1.2,
        pricingType: PricingType.PER_SECOND,
        providerCostUsd: 0.24,
      });

      expect(request.creditsConfig).toEqual({
        amount: 40,
        deferred: false,
        modelKey: 'provider/model',
        pricingMetadata: {
          marginMultiplier: 1.2,
          pricingType: PricingType.PER_SECOND,
          providerCostUsd: 0.24,
        },
      });
    });
  });

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
});
