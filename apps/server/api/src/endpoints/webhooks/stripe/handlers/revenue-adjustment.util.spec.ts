import {
  proratedNetMinor,
  revenueAdjustmentKey,
} from '@api/endpoints/webhooks/stripe/handlers/revenue-adjustment.util';
import { describe, expect, it } from 'vitest';

describe('proratedNetMinor', () => {
  const payment = { originalGrossMinor: 3_480, originalNetMinor: 2_900 };

  it('takes the same share of the net as of the gross', () => {
    expect(proratedNetMinor({ ...payment, adjustedGrossMinor: 1_740 })).toBe(
      1_450,
    );
    expect(proratedNetMinor({ ...payment, adjustedGrossMinor: 3_480 })).toBe(
      2_900,
    );
  });

  it('never exceeds the original net', () => {
    for (const adjusted of [3_481, 10_000, Number.MAX_SAFE_INTEGER]) {
      expect(
        proratedNetMinor({ ...payment, adjustedGrossMinor: adjusted }),
      ).toBe(2_900);
    }
  });

  it('is monotonic in the adjusted amount, so cumulative refunds never shrink', () => {
    let previous = 0;
    for (let adjusted = 0; adjusted <= 3_480; adjusted += 37) {
      const net = proratedNetMinor({
        ...payment,
        adjustedGrossMinor: adjusted,
      });
      expect(net).toBeGreaterThanOrEqual(previous);
      previous = net;
    }
  });

  it.each([
    { adjustedGrossMinor: 0, originalGrossMinor: 100, originalNetMinor: 100 },
    { adjustedGrossMinor: 50, originalGrossMinor: 0, originalNetMinor: 100 },
    { adjustedGrossMinor: 50, originalGrossMinor: 100, originalNetMinor: 0 },
    { adjustedGrossMinor: -5, originalGrossMinor: 100, originalNetMinor: 100 },
    {
      adjustedGrossMinor: Number.NaN,
      originalGrossMinor: 100,
      originalNetMinor: 100,
    },
  ])('returns zero for unusable amounts %j', (input) => {
    expect(proratedNetMinor(input)).toBe(0);
  });
});

describe('revenueAdjustmentKey', () => {
  it('gives each cumulative amount of one adjustment its own stable key', () => {
    expect(revenueAdjustmentKey('refund:ch_1', 500)).toBe('refund:ch_1:500');
    expect(revenueAdjustmentKey('refund:ch_1', 500)).toBe(
      revenueAdjustmentKey('refund:ch_1', 500),
    );
    expect(revenueAdjustmentKey('refund:ch_1', 900)).not.toBe(
      revenueAdjustmentKey('refund:ch_1', 500),
    );
  });
});
