import { describe, expect, it } from 'vitest';
import {
  ceilDecimalPricingRatio,
  multiplyDecimalPricing,
  sumDecimalPricing,
} from './decimal-pricing';
import { applyMargin } from './plans-pricing';

describe('decimal financial arithmetic', () => {
  it('preserves sub-micro-dollar rates and aggregates without binary carry', () => {
    expect(sumDecimalPricing([0.1, 0.02])).toBe(0.12);
    expect(multiplyDecimalPricing(0.24, 90, 3)).toBe(64.8);
    expect(multiplyDecimalPricing(0.00000001, 217)).toBe(0.00000217);
    expect(sumDecimalPricing([1e-8, 2e-8])).toBe(3e-8);
    expect(multiplyDecimalPricing(1e-200, 1e100)).toBe(1e-100);
    expect(sumDecimalPricing([1e-200, 2e-200])).toBe(3e-200);
  });
  it.each([0.07, 0.14, 0.28, 0.56, 0.12])(
    'ceil converts exact cents %s without one-credit drift',
    (usd) => {
      expect(applyMargin(usd, 1)).toBe(Math.round(usd * 100));
    },
  );
  it('keeps real fractional credit rounding and the existing minimum floor', () => {
    expect(applyMargin(0.070001, 1)).toBe(8);
    expect(applyMargin(0.01, 1)).toBe(2);
    expect(ceilDecimalPricingRatio([0.12, 1.5], 0.01)).toBe(18);
    expect(ceilDecimalPricingRatio([-0.02, 1], 0.01)).toBe(-2);
    expect(multiplyDecimalPricing(Infinity, 1)).toBeNaN();
    expect(sumDecimalPricing([NaN])).toBeNaN();
  });
});
