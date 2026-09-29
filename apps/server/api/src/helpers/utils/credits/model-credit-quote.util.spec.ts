import { quoteModelCredits } from '@api/helpers/utils/credits/model-credit-quote.util';
import { PricingType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('quoteModelCredits', () => {
  it('prices a flat legacy row from its cost', () => {
    expect(quoteModelCredits({ cost: 6, pricingType: PricingType.FLAT })).toBe(
      6,
    );
  });

  it('scales a legacy per-second row by duration', () => {
    expect(
      quoteModelCredits(
        { costPerUnit: 1.5, pricingType: PricingType.PER_SECOND },
        { duration: 5 },
      ),
    ).toBe(8);
  });

  it('scales a legacy per-megapixel row by output size', () => {
    expect(
      quoteModelCredits(
        { costPerUnit: 2, pricingType: PricingType.PER_MEGAPIXEL },
        { height: 1000, width: 2000 },
      ),
    ).toBe(4);
  });

  it('never quotes below the row minimum', () => {
    expect(
      quoteModelCredits({
        cost: 1,
        minCost: 3,
        pricingType: PricingType.FLAT,
      }),
    ).toBe(3);
  });

  it('quotes zero for a row that carries no price at all', () => {
    expect(quoteModelCredits({})).toBe(0);
  });
});
