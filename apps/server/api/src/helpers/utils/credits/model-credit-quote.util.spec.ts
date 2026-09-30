import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteModelCredits } from '@api/helpers/utils/credits/model-credit-quote.util';
import { describe, expect, it } from 'vitest';

describe('quoteModelCredits', () => {
  it('prices a configured positive flat tariff', () => {
    expect(quoteModelCredits(billableProfile({ cost: 6 }))).toBe(6);
  });
  it('rounds actual metered units once across all outputs', () => {
    expect(
      quoteModelCredits(
        billableProfile({ costPerUnit: 1.5, pricingType: 'per-second' }),
        { duration: 1, outputs: 3 },
      ),
    ).toBe(5);
  });
  it('requires bill-time duration instead of using a display sample', () => {
    expect(() =>
      quoteModelCredits(
        billableProfile({ costPerUnit: 1.5, pricingType: 'per-second' }),
      ),
    ).toThrow();
  });
  it('prices actual dimensions', () => {
    expect(
      quoteModelCredits(
        billableProfile({ costPerUnit: 2, pricingType: 'per-megapixel' }),
        { height: 1000, width: 2000 },
      ),
    ).toBe(4);
  });
  it('preserves an explicit positive legacy minimum', () => {
    expect(quoteModelCredits(billableProfile({ cost: 1, minCost: 3 }))).toBe(3);
  });
  it('requires a free designation to accept zero', () => {
    expect(() => quoteModelCredits(billableProfile({ cost: 0 }))).toThrow();
    expect(quoteModelCredits(billableProfile({ cost: 0, isFree: true }))).toBe(
      0,
    );
  });
});
