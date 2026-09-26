import { describe, expect, it } from 'vitest';
import {
  orderedChoice,
  pointwiseChoice,
  positionBiasRate,
  reconcileVerdict,
} from './pairwise';

describe('pointwiseChoice', () => {
  it('calls a tie inside the band and a winner outside it', () => {
    expect(pointwiseChoice(0.7, 0.68, 0.05)).toBe('tie');
    expect(pointwiseChoice(0.8, 0.6, 0.05)).toBe('a');
    expect(pointwiseChoice(0.4, 0.6, 0.05)).toBe('b');
  });

  it('is null when either side was not scored', () => {
    expect(pointwiseChoice(null, 0.6, 0.05)).toBeNull();
  });
});

describe('orderedChoice', () => {
  it('accepts a verdict that survives swapping the order', () => {
    // Challenger shown first and preferred; baseline shown first and not.
    expect(orderedChoice(true, false)).toEqual({
      choice: 'a',
      isPositionBiased: false,
    });
    expect(orderedChoice(false, true)).toEqual({
      choice: 'b',
      isPositionBiased: false,
    });
  });

  it('flags a judge that always prefers the first answer, and ties it', () => {
    expect(orderedChoice(true, true)).toEqual({
      choice: 'tie',
      isPositionBiased: true,
    });
    expect(orderedChoice(false, false)).toEqual({
      choice: 'tie',
      isPositionBiased: true,
    });
  });

  it('is unmeasured when an ordering failed', () => {
    expect(orderedChoice(null, true)).toEqual({
      choice: null,
      isPositionBiased: null,
    });
  });
});

describe('reconcileVerdict', () => {
  it('prefers the ordered verdict and falls back to pointwise', () => {
    expect(reconcileVerdict('b', 'a')).toBe('b');
    expect(reconcileVerdict(null, 'a')).toBe('a');
    expect(reconcileVerdict(null, null)).toBeNull();
  });
});

describe('positionBiasRate', () => {
  it('counts only measured pairs', () => {
    expect(positionBiasRate([true, false, false, null])).toBeCloseTo(1 / 3);
    expect(positionBiasRate([null])).toBeNull();
  });
});
