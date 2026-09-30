import { describe, expect, it } from 'vitest';

import {
  multiplierFromMarginPercent,
  multiplierFromMarkupPercent,
  multiplierToMarginPercent,
  multiplierToMarkupPercent,
  multiplierToPercent,
  percentToMultiplier,
  sellPriceForOneDollar,
} from './margin-conversions';

describe('multiplierToMarkupPercent', () => {
  it('reports markup percent from the multiplier', () => {
    expect(multiplierToMarkupPercent(3.33)).toBe(233);
    expect(multiplierToMarkupPercent(1.7)).toBe(70);
    expect(multiplierToMarkupPercent(1)).toBe(0);
  });

  it('falls back to 0% for invalid input', () => {
    expect(multiplierToMarkupPercent(0)).toBe(0);
    expect(multiplierToMarkupPercent(-1)).toBe(0);
    expect(multiplierToMarkupPercent(Number.NaN)).toBe(0);
  });
});

describe('multiplierToMarginPercent', () => {
  it('reports margin percent from the multiplier', () => {
    expect(multiplierToMarginPercent(3.33)).toBe(70);
    expect(multiplierToMarginPercent(1.7)).toBe(41);
    expect(multiplierToMarginPercent(1)).toBe(0);
  });

  it('falls back to 0% for invalid input', () => {
    expect(multiplierToMarginPercent(0)).toBe(0);
    expect(multiplierToMarginPercent(-1)).toBe(0);
    expect(multiplierToMarginPercent(Number.NaN)).toBe(0);
  });
});

describe('multiplierFromMarkupPercent', () => {
  it('resolves a markup percent to a multiplier', () => {
    expect(multiplierFromMarkupPercent(233)).toBeCloseTo(3.33, 5);
    expect(multiplierFromMarkupPercent(70)).toBeCloseTo(1.7, 5);
    expect(multiplierFromMarkupPercent(0)).toBe(1);
  });

  it('falls back to 1× for invalid input', () => {
    expect(multiplierFromMarkupPercent(-100)).toBe(1);
    expect(multiplierFromMarkupPercent(-150)).toBe(1);
    expect(multiplierFromMarkupPercent(Number.NaN)).toBe(1);
  });

  it('round-trips through multiplierToMarkupPercent', () => {
    expect(multiplierToMarkupPercent(multiplierFromMarkupPercent(233))).toBe(
      233,
    );
  });
});

describe('multiplierFromMarginPercent', () => {
  it('resolves a margin percent to a multiplier', () => {
    expect(multiplierFromMarginPercent(70)).toBeCloseTo(3.33, 1);
    expect(multiplierFromMarginPercent(0)).toBe(1);
  });

  it('falls back to 1× for invalid input', () => {
    expect(multiplierFromMarginPercent(100)).toBe(1);
    expect(multiplierFromMarginPercent(150)).toBe(1);
    expect(multiplierFromMarginPercent(Number.NaN)).toBe(1);
  });

  it('round-trips through multiplierToMarginPercent', () => {
    expect(multiplierToMarginPercent(multiplierFromMarginPercent(70))).toBe(70);
  });
});

describe('multiplierToPercent / percentToMultiplier (mode-aware)', () => {
  it('reads and writes through the MARKUP mode', () => {
    expect(multiplierToPercent(3.33, 'MARKUP')).toBe(233);
    expect(percentToMultiplier(233, 'MARKUP')).toBeCloseTo(3.33, 5);
  });

  it('reads and writes through the MARGIN mode', () => {
    expect(multiplierToPercent(3.33, 'MARGIN')).toBe(70);
    expect(percentToMultiplier(70, 'MARGIN')).toBeCloseTo(3.33, 1);
  });
});

describe('sellPriceForOneDollar', () => {
  it('is the multiplier itself, normalized', () => {
    expect(sellPriceForOneDollar(3.33)).toBe(3.33);
    expect(sellPriceForOneDollar(0)).toBe(1);
    expect(sellPriceForOneDollar(Number.NaN)).toBe(1);
  });
});
