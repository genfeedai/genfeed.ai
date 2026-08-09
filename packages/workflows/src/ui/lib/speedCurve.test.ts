import { describe, expect, it } from 'vitest';
import { easing } from './easing';
import {
  analyzeWarpCurve,
  calculateWarpedDuration,
  validateWarpFunction,
  warpTime,
} from './speedCurve';

describe('warpTime', () => {
  it('maps the start of the input to 0', () => {
    expect(warpTime(0)).toBeCloseTo(0, 4);
  });

  it('maps the end of the input to the output duration', () => {
    expect(warpTime(5, 5, 1.5)).toBeCloseTo(1.5, 4);
  });

  it('is identity-scaled for linear easing', () => {
    expect(warpTime(2.5, 5, 1.5, 'linear')).toBeCloseTo(0.75, 3);
  });

  it('accepts easing function names as strings', () => {
    const named = warpTime(1, 5, 1.5, 'easeInQuad');
    const direct = warpTime(1, 5, 1.5, easing.easeInQuad);
    expect(named).toBeCloseTo(direct, 6);
  });

  it('clamps timestamps outside the input range', () => {
    expect(warpTime(-3, 5, 1.5)).toBeCloseTo(0, 4);
    expect(warpTime(50, 5, 1.5)).toBeCloseTo(1.5, 4);
  });

  it('uses the inverse for monotonic easing (ease-in warps early frames slower)', () => {
    // easeInQuad grows slowly at the start, so its inverse grows fast:
    // early original timestamps map to later warped timestamps than linear.
    const linear = warpTime(1, 5, 1.5, 'linear');
    const eased = warpTime(1, 5, 1.5, 'easeInQuad');
    expect(eased).toBeGreaterThan(linear);
  });

  it('falls back to direct mapping for non-monotonic functions', () => {
    const bounce = (t: number): number => Math.abs(Math.sin(t * Math.PI * 2));
    const result = warpTime(2.5, 5, 1.5, bounce);
    expect(result).toBeCloseTo(bounce(0.5) * 1.5, 4);
  });
});

describe('calculateWarpedDuration', () => {
  it('returns the warped end minus warped start', () => {
    const duration = calculateWarpedDuration(0, 5, 5, 1.5, 'linear');
    expect(duration).toBeCloseTo(1.5, 4);
  });

  it('splits a linear warp proportionally', () => {
    const duration = calculateWarpedDuration(1, 1, 5, 1.5, 'linear');
    expect(duration).toBeCloseTo(0.3, 3);
  });

  it('is non-negative for monotonic easings', () => {
    const duration = calculateWarpedDuration(2, 1, 5, 1.5, 'easeInOutCubic');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});

describe('validateWarpFunction', () => {
  it('accepts the default easing', () => {
    const result = validateWarpFunction();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts linear easing by name', () => {
    expect(validateWarpFunction('linear').valid).toBe(true);
  });

  it('rejects a function that violates the endpoint contract', () => {
    const reversed = (t: number): number => 1 - t;
    const result = validateWarpFunction(reversed, 5, 1.5);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports monotonicity violations', () => {
    const wave = (t: number): number => Math.abs(Math.sin(t * Math.PI * 2));
    const result = validateWarpFunction(wave, 5, 1.5);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.includes('Monotonicity violation')),
    ).toBe(true);
  });
});

describe('analyzeWarpCurve', () => {
  it('returns one multiplier per sample', () => {
    const analysis = analyzeWarpCurve('linear', 5, 1.5, 50);
    expect(analysis.speedMultipliers).toHaveLength(50);
  });

  it('linear easing keeps speed constant at ~1x', () => {
    const analysis = analyzeWarpCurve('linear', 5, 1.5, 20);
    expect(analysis.minSpeed).toBeCloseTo(1, 1);
    expect(analysis.maxSpeed).toBeCloseTo(1, 1);
    expect(analysis.avgSpeed).toBeCloseTo(1, 1);
  });

  it('easeInOutCubic varies speed across the clip', () => {
    const analysis = analyzeWarpCurve('easeInOutCubic', 5, 1.5, 100);
    expect(analysis.maxSpeed).toBeGreaterThan(analysis.minSpeed);
    expect(analysis.minSpeed).toBeGreaterThan(0);
  });

  it('min <= avg <= max', () => {
    const analysis = analyzeWarpCurve('easeOutQuad', 5, 1.5, 100);
    expect(analysis.minSpeed).toBeLessThanOrEqual(analysis.avgSpeed);
    expect(analysis.avgSpeed).toBeLessThanOrEqual(analysis.maxSpeed);
  });
});
