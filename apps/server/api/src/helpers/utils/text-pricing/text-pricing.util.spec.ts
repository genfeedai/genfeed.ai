import {
  calculateEstimatedTextCredits,
  estimateTextTokens,
  extractBillableText,
  getMinimumTextCredits,
  roundUpTextCredits,
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

  it('gates per-token models on one whole credit without billing it', () => {
    expect(getMinimumTextCredits({ pricingType: 'per-token' })).toBe(1);
    expect(getMinimumTextCredits({ cost: 4, minCost: 2 })).toBe(2);
    expect(getMinimumTextCredits({ cost: 4 })).toBe(4);
  });

  it('rounds up to two decimals and never bills a used call as free', () => {
    expect(roundUpTextCredits(0)).toBe(0);
    expect(roundUpTextCredits(Number.NaN)).toBe(0);
    expect(roundUpTextCredits(0.0001)).toBe(0.01);
    expect(roundUpTextCredits(0.07)).toBe(0.07);
    expect(roundUpTextCredits(0.071)).toBe(0.08);
    expect(roundUpTextCredits(2.5)).toBe(2.5);
  });

  it('returns flat cost for a model with no token rates', () => {
    expect(
      calculateEstimatedTextCredits(
        { cost: 7, pricingType: 'flat' },
        'hi',
        'ok',
      ),
    ).toBe(7);
  });

  it('bills per-token credit rates to two decimals with no 1-credit floor', () => {
    const model = {
      inputCostPerMillionTokens: 1_000_000,
      outputCostPerMillionTokens: 1_000_000,
      pricingType: 'per-token',
    };

    expect(calculateEstimatedTextCredits(model, 'abcd', 'efgh')).toBe(2);
    expect(
      calculateEstimatedTextCredits(
        {
          ...model,
          inputCostPerMillionTokens: 3_000,
          outputCostPerMillionTokens: 15_000,
        },
        'a'.repeat(400),
        'b'.repeat(200),
      ),
    ).toBe(1.05);
    expect(
      calculateEstimatedTextCredits(
        {
          ...model,
          inputCostPerMillionTokens: 10,
          outputCostPerMillionTokens: 10,
        },
        'abcd',
        'efgh',
      ),
    ).toBe(0.01);
    expect(calculateEstimatedTextCredits(model, '', '')).toBe(0);
  });

  it('bills the admission minimum for a per-token row with no rates', () => {
    expect(
      calculateEstimatedTextCredits(
        { pricingType: 'per-token' },
        'abcd',
        'efgh',
      ),
    ).toBe(1);
  });

  it('bills provider USD token rates at the agent margin instead of the flat cost', () => {
    const geminiFlash = {
      cost: 3,
      inputCostPerMillionTokens: 0.75,
      outputCostPerMillionTokens: 3.75,
      pricingType: 'flat',
    };

    // 1,000 prompt + 500 completion tokens: $0.002625 provider cost, x1.7 margin, at $0.01 per credit
    expect(
      calculateEstimatedTextCredits(
        geminiFlash,
        'a'.repeat(4_000),
        'b'.repeat(2_000),
      ),
    ).toBe(0.45);
    expect(calculateEstimatedTextCredits(geminiFlash, '', '')).toBe(0);
  });
});
