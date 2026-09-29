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
});

describe('calculateWarpedDuration', () => {
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
