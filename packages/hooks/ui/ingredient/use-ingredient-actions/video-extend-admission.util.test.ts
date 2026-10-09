import { PricingType } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  getVideoExtendDurationOptions,
  getVideoExtendQuote,
} from '@hooks/ui/ingredient/use-ingredient-actions/video-extend-admission.util';
import { describe, expect, it } from 'vitest';

const model = {
  key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
  label: 'Veo',
  cost: 10,
  durations: [5, 8],
};

describe('video extension quote admission', () => {
  it.each([undefined, [], [Number.NaN], [-1], [31], [4.5]])(
    'rejects invalid duration metadata (%j)',
    (durations) => {
      const current = { ...model, durations };
      expect(getVideoExtendDurationOptions(current)).toEqual([]);
      expect(getVideoExtendQuote(current, 8)).toBeNull();
    },
  );
  it('deduplicates published durations without inventing options', () => {
    expect(
      getVideoExtendDurationOptions({ ...model, durations: [5, 8, 5] }),
    ).toEqual([5, 8]);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid base and minimum prices (%s)',
    (cost) => {
      expect(getVideoExtendQuote({ ...model, cost }, 8)).toBeNull();
      expect(getVideoExtendQuote({ ...model, minCost: cost }, 8)).toBeNull();
    },
  );
  it('blocks unsupported price units and missing duration rates', () => {
    expect(
      getVideoExtendQuote(
        { ...model, pricingType: PricingType.PER_MEGAPIXEL },
        8,
      ),
    ).toBeNull();
    expect(
      getVideoExtendQuote({ ...model, pricingType: PricingType.PER_SECOND }, 8),
    ).toBeNull();
  });
  it('uses the known per-second rate, minimum and fabricated stitch charge', () => {
    expect(
      getVideoExtendQuote(
        {
          ...model,
          pricingType: PricingType.PER_SECOND,
          costPerUnit: 2,
          minCost: 20,
        },
        8,
      ),
    ).toBe(21);
  });
  it('preserves an explicit zero base price and mandatory fabricated stitch charge', () => {
    expect(
      getVideoExtendQuote(
        { ...model, cost: 0, pricingType: PricingType.FLAT },
        8,
      ),
    ).toBe(1);
  });
  it('rejects durations outside the published choices', () => {
    expect(getVideoExtendQuote(model, 12)).toBeNull();
  });
});
