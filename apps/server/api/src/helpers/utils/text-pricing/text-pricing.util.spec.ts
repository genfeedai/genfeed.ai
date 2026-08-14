import {
  calculateEstimatedTextCredits,
  estimateTextTokens,
  extractBillableText,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { describe, expect, it } from 'vitest';

describe('text-pricing.util', () => {
  it('flattens nested values into billable text', () => {
    expect(extractBillableText('hello')).toBe('hello');
    expect(extractBillableText(12)).toBe('12');
    expect(extractBillableText(true)).toBe('true');
    expect(extractBillableText(['a', { b: 'c' }])).toBe('a c');
    expect(extractBillableText(null)).toBe('');
  });

  it('estimates tokens as ceil(length / 4)', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimateTextTokens('abcde')).toBe(2);
  });

  it('uses a 1-credit floor for per-token models', () => {
    expect(getMinimumTextCredits({ pricingType: 'per-token' })).toBe(1);
    expect(getMinimumTextCredits({ cost: 4, minCost: 2 })).toBe(2);
    expect(getMinimumTextCredits({ cost: 4 })).toBe(4);
  });

  it('returns flat cost unless the model is per-token', () => {
    expect(
      calculateEstimatedTextCredits(
        { cost: 7, pricingType: 'flat' },
        'hi',
        'ok',
      ),
    ).toBe(7);

    expect(
      calculateEstimatedTextCredits(
        {
          inputCostPerMillionTokens: 1_000_000,
          outputCostPerMillionTokens: 1_000_000,
          pricingType: 'per-token',
        },
        'abcd',
        'efgh',
      ),
    ).toBe(2);
  });
});
