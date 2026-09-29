import { describe, expect, it } from 'vitest';
import {
  createAsymmetricEase,
  createBezierEasing,
  DEFAULT_CUSTOM_BEZIER,
  EASING_BEZIER_MAP,
  easing,
  getAllEasingNames,
  getEasingBezier,
  getEasingFunction,
  getPresetBezier,
  PRESET_BEZIERS,
} from './easing';

describe('parametric easing functions', () => {
  it('every easing function maps 0 to ~0 and 1 to ~1', () => {
    for (const name of getAllEasingNames()) {
      const func = getEasingFunction(name);
      expect(func(0), `${name}(0)`).toBeCloseTo(0, 4);
      expect(func(1), `${name}(1)`).toBeCloseTo(1, 4);
    }
  });

  it('every easing function stays finite across the domain', () => {
    for (const name of getAllEasingNames()) {
      const func = getEasingFunction(name);
      for (let i = 0; i <= 10; i++) {
        const value = func(i / 10);
        expect(Number.isFinite(value), `${name}(${i / 10})`).toBe(true);
      }
    }
  });

  it('exports 24 easing functions (22 base + 2 hybrids)', () => {
    expect(getAllEasingNames()).toHaveLength(24);
    expect(getAllEasingNames()).toContain('easeInExpoOutCubic');
    expect(getAllEasingNames()).toContain('easeInQuartOutQuad');
  });

  it('expo easings honor their exact endpoints', () => {
    expect(easing.easeInExpo(0)).toBe(0);
    expect(easing.easeOutExpo(1)).toBe(1);
    expect(easing.easeInOutExpo(0)).toBe(0);
    expect(easing.easeInOutExpo(1)).toBe(1);
  });
});

describe('getEasingFunction', () => {
  it('falls back to linear for unknown names', () => {
    expect(getEasingFunction('nope')(0.3)).toBeCloseTo(0.3, 6);
  });
});

describe('createAsymmetricEase', () => {
  it('is continuous at the midpoint', () => {
    const hybrid = createAsymmetricEase(easing.easeInExpo, easing.easeOutCubic);
    expect(hybrid(0.5)).toBeCloseTo(0.5, 4);
  });
});

describe('createBezierEasing', () => {
  it('clamps inputs outside [0, 1]', () => {
    const curve = createBezierEasing(0.42, 0, 0.58, 1);
    expect(curve(-1)).toBeCloseTo(0, 4);
    expect(curve(2)).toBeCloseTo(1, 4);
  });

  it('clamps control points outside [0, 1]', () => {
    const curve = createBezierEasing(-5, 0, 7, 1);
    expect(curve(0)).toBeCloseTo(0, 4);
    expect(curve(1)).toBeCloseTo(1, 4);
  });

  it('matches the named easeInOutCubic approximation shape', () => {
    const curve = createBezierEasing(0.65, 0, 0.35, 1);
    expect(curve(0.5)).toBeCloseTo(0.5, 2);
    expect(curve(0.2)).toBeLessThan(0.2);
    expect(curve(0.8)).toBeGreaterThan(0.8);
  });
});

describe('getPresetBezier', () => {
  it('returns a copy of a known preset', () => {
    const bezier = getPresetBezier('easeInOutCubic');
    expect(bezier).toEqual(PRESET_BEZIERS.easeInOutCubic);
    expect(bezier).not.toBe(PRESET_BEZIERS.easeInOutCubic);
  });

  it('falls back to the default custom bezier', () => {
    expect(getPresetBezier('unknown')).toEqual(DEFAULT_CUSTOM_BEZIER);
    expect(getPresetBezier(null)).toEqual(DEFAULT_CUSTOM_BEZIER);
    expect(getPresetBezier()).toEqual(DEFAULT_CUSTOM_BEZIER);
  });
});

describe('getEasingBezier', () => {
  it('returns a copy of a known map entry', () => {
    const bezier = getEasingBezier('easeInCubic');
    expect(bezier).toEqual(EASING_BEZIER_MAP.easeInCubic);
    expect(bezier).not.toBe(EASING_BEZIER_MAP.easeInCubic);
  });

  it('falls back to the default custom bezier', () => {
    expect(getEasingBezier('unknown')).toEqual(DEFAULT_CUSTOM_BEZIER);
    expect(getEasingBezier(undefined)).toEqual(DEFAULT_CUSTOM_BEZIER);
  });
});
