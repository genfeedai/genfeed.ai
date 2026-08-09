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

  it('easeInQuad is t^2', () => {
    expect(easing.easeInQuad(0.5)).toBeCloseTo(0.25, 6);
  });

  it('easeOutQuad mirrors easeInQuad', () => {
    expect(easing.easeOutQuad(0.5)).toBeCloseTo(1 - easing.easeInQuad(0.5), 6);
  });

  it('easeInOut functions hit 0.5 at the midpoint', () => {
    for (const name of [
      'easeInOutQuad',
      'easeInOutCubic',
      'easeInOutQuart',
      'easeInOutQuint',
      'easeInOutSine',
      'easeInOutExpo',
      'easeInOutCirc',
    ] as const) {
      expect(easing[name](0.5), name).toBeCloseTo(0.5, 4);
    }
  });

  it('expo easings honor their exact endpoints', () => {
    expect(easing.easeInExpo(0)).toBe(0);
    expect(easing.easeOutExpo(1)).toBe(1);
    expect(easing.easeInOutExpo(0)).toBe(0);
    expect(easing.easeInOutExpo(1)).toBe(1);
  });
});

describe('getEasingFunction', () => {
  it('resolves known names', () => {
    expect(getEasingFunction('easeInCubic')).toBe(easing.easeInCubic);
  });

  it('falls back to linear for unknown names', () => {
    expect(getEasingFunction('nope')(0.3)).toBeCloseTo(0.3, 6);
  });
});

describe('createAsymmetricEase', () => {
  it('uses the ease-in half below 0.5', () => {
    const hybrid = createAsymmetricEase(easing.easeInQuad, easing.easeOutQuad);
    expect(hybrid(0.25)).toBeCloseTo(0.5 * easing.easeInQuad(0.5), 6);
  });

  it('uses the ease-out half above 0.5', () => {
    const hybrid = createAsymmetricEase(easing.easeInQuad, easing.easeOutQuad);
    expect(hybrid(0.75)).toBeCloseTo(0.5 + 0.5 * easing.easeOutQuad(0.5), 6);
  });

  it('is continuous at the midpoint', () => {
    const hybrid = createAsymmetricEase(easing.easeInExpo, easing.easeOutCubic);
    expect(hybrid(0.5)).toBeCloseTo(0.5, 4);
  });
});

describe('createBezierEasing', () => {
  it('a linear bezier behaves like identity', () => {
    const linear = createBezierEasing(0, 0, 1, 1);
    for (let i = 0; i <= 10; i++) {
      expect(linear(i / 10)).toBeCloseTo(i / 10, 3);
    }
  });

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
    const bezier = getPresetBezier('easeInOut');
    expect(bezier).toEqual(PRESET_BEZIERS.easeInOut);
    expect(bezier).not.toBe(PRESET_BEZIERS.easeInOut);
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
