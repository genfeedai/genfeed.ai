import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ceilDecimalPricingRatio,
  multiplyDecimalPricing,
  sumDecimalPricing,
} from './decimal-pricing';

/** Two-decimal amounts, the shape provider rates and credit prices take. */
const centsArbitrary = fc.integer({ max: 1_000_000, min: -1_000_000 });
const smallCentsArbitrary = fc.integer({ max: 100_000, min: -100_000 });

describe('decimal pricing properties', () => {
  it('sums two-decimal amounts exactly, with no binary float drift', () => {
    fc.assert(
      fc.property(fc.array(centsArbitrary, { maxLength: 8 }), (cents) => {
        const total = cents.reduce((sum, value) => sum + value, 0);

        expect(sumDecimalPricing(cents.map((value) => value / 100))).toBe(
          total / 100,
        );
      }),
    );
  });

  it('sums in any order', () => {
    fc.assert(
      fc.property(fc.array(centsArbitrary, { maxLength: 8 }), (cents) => {
        const amounts = cents.map((value) => value / 100);

        expect(sumDecimalPricing([...amounts].reverse())).toBe(
          sumDecimalPricing(amounts),
        );
      }),
    );
  });

  it('multiplies two-decimal amounts exactly', () => {
    fc.assert(
      fc.property(smallCentsArbitrary, smallCentsArbitrary, (left, right) => {
        // `+ 0` turns a native -0 (zero times a negative) into 0, which is
        // what exact arithmetic returns.
        expect(multiplyDecimalPricing(left / 100, right / 100)).toBe(
          (left * right) / 10_000 + 0,
        );
      }),
    );
  });

  it('multiplies commutatively and keeps a value under multiplication by one', () => {
    fc.assert(
      fc.property(smallCentsArbitrary, smallCentsArbitrary, (left, right) => {
        const a = left / 100;
        const b = right / 100;

        expect(multiplyDecimalPricing(a, b)).toBe(multiplyDecimalPricing(b, a));
        expect(multiplyDecimalPricing(a, 1)).toBe(a);
      }),
    );
  });

  it('rounds a whole-number ratio up exactly, never under or over', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 1000 }), { maxLength: 3, minLength: 1 }),
        fc.integer({ max: 1000, min: 1 }),
        (factors, divisor) => {
          const product = factors.reduce(
            (result, factor) => result * BigInt(factor),
            BigInt(1),
          );
          const step = BigInt(divisor);

          expect(ceilDecimalPricingRatio(factors, divisor)).toBe(
            Number((product + step - BigInt(1)) / step),
          );
        },
      ),
    );
  });

  it('is not a number when the divisor cannot divide', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 1000 }), { maxLength: 3, minLength: 1 }),
        fc.integer({ max: 0, min: -1000 }),
        (factors, divisor) => {
          expect(ceilDecimalPricingRatio(factors, divisor)).toBeNaN();
        },
      ),
    );
  });

  it('is not a number for a non-finite input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ),
        smallCentsArbitrary,
        (invalid, cents) => {
          expect(sumDecimalPricing([cents / 100, invalid])).toBeNaN();
          expect(multiplyDecimalPricing(cents / 100, invalid)).toBeNaN();
        },
      ),
    );
  });
});
