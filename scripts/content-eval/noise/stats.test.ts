import { describe, expect, it } from 'vitest';
import { estimate, mean, pooledSd, sampleSd, tCritical95 } from './stats';

describe('noise stats', () => {
  it('uses the tabulated t critical value and never narrows between rows', () => {
    expect(tCritical95(1)).toBe(12.706);
    expect(tCritical95(2)).toBe(4.303);
    expect(tCritical95(11)).toBe(2.228);
    expect(tCritical95(500)).toBe(1.98);
    expect(tCritical95(0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('computes the mean, sample sd and a 95% t-interval by hand-checked values', () => {
    // mean 0.6, sd = sqrt(0.025) ≈ 0.158114, se = sd/√5, t(4) = 2.776.
    const result = estimate([0.4, 0.5, 0.6, 0.7, 0.8]);
    expect(result.mean).toBeCloseTo(0.6, 10);
    expect(result.sd).toBeCloseTo(0.158_114, 5);
    expect(result.halfWidth).toBeCloseTo(2.776 * (0.158_114 / Math.sqrt(5)), 5);
    expect(result.ci95?.lower).toBeCloseTo(0.6 - (result.halfWidth ?? 0), 10);
    expect(result.ci95?.upper).toBeCloseTo(0.6 + (result.halfWidth ?? 0), 10);
    expect(result.n).toBe(5);
  });

  it('has no interval below two values, never a zero-width one', () => {
    expect(estimate([])).toEqual({
      ci95: null,
      halfWidth: null,
      mean: null,
      n: 0,
      sd: null,
    });
    expect(estimate([0.7])).toMatchObject({ ci95: null, mean: 0.7, n: 1 });
    expect(sampleSd([1])).toBeNull();
    expect(mean([])).toBeNull();
  });

  it('pools repeat variance across cases and skips single-repeat cases', () => {
    // Case A: [0.2, 0.4] → SS 0.02, df 1. Case B: [0.5, 0.5, 0.5] → SS 0, df 2. Case C: single.
    expect(pooledSd([[0.2, 0.4], [0.5, 0.5, 0.5], [0.9]])).toBeCloseTo(
      Math.sqrt(0.02 / 3),
      10,
    );
    expect(pooledSd([[0.9], [0.1]])).toBeNull();
  });
});
