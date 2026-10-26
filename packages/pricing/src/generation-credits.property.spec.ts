import { PricingType } from '@genfeedai/contracts';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  applyMinCost,
  calculateImageGenerationCredits,
  calculateMegapixelCost,
  calculateVideoGenerationCredits,
} from './generation-credit-calculator';
import {
  multiplierFromMarginPercent,
  multiplierFromMarkupPercent,
  multiplierToMarginPercent,
  multiplierToMarkupPercent,
  percentToMultiplier,
  sellPriceForOneDollar,
} from './margin-conversions';
import {
  MAX_MARGIN_MULTIPLIER,
  normalizeMarginMultiplier,
} from './plans-pricing';

const MODEL_KEY = 'test/flat-model';

/** Every number a form field or a database column can hand a price function. */
const anyNumberArbitrary = fc.oneof(
  fc.double(),
  fc.integer(),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -1,
  ),
);
const positiveMultiplierArbitrary = fc.double({
  max: 50,
  min: 0.0001,
  noNaN: true,
});
const creditsArbitrary = fc.integer({ max: 500, min: 0 });
const outputsArbitrary = fc.integer({ max: 8, min: 1 });

describe('margin multiplier properties', () => {
  it('keeps any input inside (0, max] or on the fallback', () => {
    fc.assert(
      fc.property(
        anyNumberArbitrary,
        fc.double({ max: 5, min: 0.1, noNaN: true }),
        (multiplier, fallback) => {
          const isValid = Number.isFinite(multiplier) && multiplier > 0;

          expect(normalizeMarginMultiplier(multiplier, fallback)).toBe(
            isValid ? Math.min(multiplier, MAX_MARGIN_MULTIPLIER) : fallback,
          );
        },
      ),
    );
  });

  it('always sells at a finite positive multiplier no higher than the cap', () => {
    fc.assert(
      fc.property(anyNumberArbitrary, (multiplier) => {
        const sellPrice = sellPriceForOneDollar(multiplier);

        expect(Number.isFinite(sellPrice)).toBe(true);
        expect(sellPrice).toBeGreaterThan(0);
        expect(sellPrice).toBeLessThanOrEqual(MAX_MARGIN_MULTIPLIER);
      }),
    );
  });

  it('resolves any operator-typed percent to a usable multiplier in both modes', () => {
    fc.assert(
      fc.property(anyNumberArbitrary, (percent) => {
        for (const mode of ['MARKUP', 'MARGIN'] as const) {
          const multiplier = percentToMultiplier(percent, mode);

          expect(Number.isFinite(multiplier)).toBe(true);
          expect(multiplier).toBeGreaterThan(0);
          expect(multiplier).toBeLessThanOrEqual(MAX_MARGIN_MULTIPLIER);
        }

        expect(Number.isFinite(multiplierFromMarkupPercent(percent))).toBe(
          true,
        );
        expect(Number.isFinite(multiplierFromMarginPercent(percent))).toBe(
          true,
        );
      }),
    );
  });

  it('reads a larger multiplier as an equal or larger percent', () => {
    fc.assert(
      fc.property(
        positiveMultiplierArbitrary,
        positiveMultiplierArbitrary,
        (first, second) => {
          const [low, high] =
            first <= second ? [first, second] : [second, first];

          expect(multiplierToMarkupPercent(low)).toBeLessThanOrEqual(
            multiplierToMarkupPercent(high),
          );
          expect(multiplierToMarginPercent(low)).toBeLessThanOrEqual(
            multiplierToMarginPercent(high),
          );
        },
      ),
    );
  });

  it('reports whole percents for any multiplier an operator can set', () => {
    fc.assert(
      fc.property(positiveMultiplierArbitrary, (multiplier) => {
        expect(Number.isInteger(multiplierToMarkupPercent(multiplier))).toBe(
          true,
        );
        expect(Number.isInteger(multiplierToMarginPercent(multiplier))).toBe(
          true,
        );
      }),
    );
  });

  it('never reads a margin of 100% or more', () => {
    fc.assert(
      fc.property(anyNumberArbitrary, (multiplier) => {
        expect(multiplierToMarginPercent(multiplier)).toBeLessThan(100);
      }),
    );
  });
});

describe('megapixel and minimum cost properties', () => {
  it('never undercharges a megapixel rate and overcharges by at most one credit', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 8192, min: 1 }),
        fc.integer({ max: 8192, min: 1 }),
        fc.integer({ max: 1000, min: 1 }),
        (width, height, costPerMegapixel) => {
          const scaledPixels = width * height * costPerMegapixel;
          const remainder = scaledPixels % 1_000_000;
          const exactCredits =
            (scaledPixels - remainder) / 1_000_000 + (remainder > 0 ? 1 : 0);
          const charged = calculateMegapixelCost(
            width,
            height,
            costPerMegapixel,
          );

          expect(charged).toBeGreaterThanOrEqual(exactCredits);
          expect(charged).toBeLessThanOrEqual(exactCredits + 1);
          // A fractional exact price is at least a millionth from a whole
          // credit, far outside float error, so it must round exactly.
          if (remainder > 0) {
            expect(charged).toBe(exactCredits);
          }
        },
      ),
    );
  });

  it('applies a minimum cost as a floor and never lowers a cost', () => {
    fc.assert(
      fc.property(creditsArbitrary, creditsArbitrary, (baseCost, minCost) => {
        const charged = applyMinCost(baseCost, minCost);

        expect(charged).toBeGreaterThanOrEqual(baseCost);
        expect(charged).toBe(
          minCost > 0 ? Math.max(baseCost, minCost) : baseCost,
        );
        expect(applyMinCost(charged, minCost)).toBe(charged);
      }),
    );
  });
});

describe('image generation credit properties', () => {
  const imageInputArbitrary = fc.record({
    cost: creditsArbitrary,
    imageProvider: fc.constantFrom('fal', 'replicate', 'openai', null),
    isBatchSupported: fc.boolean(),
    outputs: outputsArbitrary,
  });

  function quoteFlatImage(input: {
    cost: number;
    imageProvider: string | null;
    isBatchSupported: boolean;
    outputs: number;
  }) {
    return calculateImageGenerationCredits({
      imageProvider: input.imageProvider,
      isBatchSupported: input.isBatchSupported,
      modelKey: MODEL_KEY,
      outputs: input.outputs,
      pricing: { cost: input.cost, pricingType: PricingType.FLAT },
    });
  }

  it('charges the flat price once per output only when the provider fans out', () => {
    fc.assert(
      fc.property(imageInputArbitrary, (input) => {
        const isFanOut =
          input.imageProvider === 'fal' ||
          (input.imageProvider === 'replicate' && !input.isBatchSupported);
        const billedOutputs = isFanOut ? input.outputs : 1;
        const unitCredits = Math.max(1, input.cost);
        const quote = quoteFlatImage(input);

        expect(quote.unitCredits).toBe(unitCredits);
        expect(quote.billedOutputs).toBe(billedOutputs);
        expect(quote.credits).toBe(unitCredits * billedOutputs);
      }),
    );
  });

  it('never charges less for more outputs', () => {
    fc.assert(
      fc.property(
        imageInputArbitrary,
        outputsArbitrary,
        (input, moreOutputs) => {
          const fewer = Math.min(input.outputs, moreOutputs);
          const more = Math.max(input.outputs, moreOutputs);

          expect(
            quoteFlatImage({ ...input, outputs: fewer }).credits,
          ).toBeLessThanOrEqual(
            quoteFlatImage({ ...input, outputs: more }).credits,
          );
        },
      ),
    );
  });

  it('charges at least one credit for a request with no catalog row', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('fal', 'replicate', 'openai', null),
        fc.boolean(),
        outputsArbitrary,
        (imageProvider, isBatchSupported, outputs) => {
          const quote = calculateImageGenerationCredits({
            imageProvider,
            isBatchSupported,
            modelKey: MODEL_KEY,
            outputs,
            pricing: null,
          });

          expect(quote.unitCredits).toBeGreaterThanOrEqual(1);
          expect(quote.credits).toBeGreaterThanOrEqual(quote.unitCredits);
        },
      ),
    );
  });
});

describe('video generation credit properties', () => {
  const videoInputArbitrary = fc.record({
    cost: creditsArbitrary,
    isBatchSupported: fc.boolean(),
    outputs: outputsArbitrary,
  });

  function quoteFlatVideo(input: {
    cost: number;
    isBatchSupported: boolean;
    outputs: number;
  }) {
    return calculateVideoGenerationCredits({
      isBatchSupported: input.isBatchSupported,
      modelKey: MODEL_KEY,
      outputs: input.outputs,
      pricing: { cost: input.cost, pricingType: PricingType.FLAT },
    });
  }

  it('charges the flat price once per output only when the model cannot batch', () => {
    fc.assert(
      fc.property(videoInputArbitrary, (input) => {
        const billedOutputs = input.isBatchSupported ? 1 : input.outputs;
        const quote = quoteFlatVideo(input);

        expect(quote.unitCredits).toBe(input.cost);
        expect(quote.credits).toBe(input.cost * billedOutputs);
        expect(quote.billedOutputs).toBe(input.cost > 0 ? billedOutputs : 1);
      }),
    );
  });

  it('never charges less for more outputs', () => {
    fc.assert(
      fc.property(
        videoInputArbitrary,
        outputsArbitrary,
        (input, moreOutputs) => {
          const fewer = Math.min(input.outputs, moreOutputs);
          const more = Math.max(input.outputs, moreOutputs);

          expect(
            quoteFlatVideo({ ...input, outputs: fewer }).credits,
          ).toBeLessThanOrEqual(
            quoteFlatVideo({ ...input, outputs: more }).credits,
          );
        },
      ),
    );
  });
});
