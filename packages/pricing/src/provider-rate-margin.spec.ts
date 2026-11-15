import type { ModelPricingRateChange } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { findRateChangesAboveSellPrice } from './provider-rate-margin';

const change = (
  oldPriceUsd: number | null,
  newPriceUsd: number | null,
): ModelPricingRateChange => ({
  component: 'output',
  newPriceUsd,
  oldPriceUsd,
  unit: 'output',
  variant: '1k',
});

describe('findRateChangesAboveSellPrice', () => {
  it('flags a rise of more than the multiplier, as a loss on every run', () => {
    // 3.33x on $0.0205 sells at $0.068265.
    expect(
      findRateChangesAboveSellPrice([change(0.0205, 0.07)], 3.33).map(
        (item) => item.change.newPriceUsd,
      ),
    ).toEqual([0.07]);
  });

  it('does not flag a doubled price, which only costs margin (FLUX.3 today)', () => {
    expect(
      findRateChangesAboveSellPrice(
        [change(0.0205, 0.041), change(0.3035, 0.607)],
        3.33,
      ),
    ).toEqual([]);
  });

  it('leaves new and removed variants alone, there is no price to compare', () => {
    expect(
      findRateChangesAboveSellPrice(
        [change(null, 5), change(5, null), change(0, 5)],
        3.33,
      ),
    ).toEqual([]);
  });

  it('uses the lower multiplier on the cost above the taper knee', () => {
    // $1.00 sells at 0.5 * 3.33 + 0.5 * 2.0 = $2.665; $2.70 is above it.
    const [flagged] = findRateChangesAboveSellPrice([change(1, 2.7)], 3.33);
    expect(flagged?.sellPriceUsd).toBeCloseTo(2.665, 6);
  });
});
