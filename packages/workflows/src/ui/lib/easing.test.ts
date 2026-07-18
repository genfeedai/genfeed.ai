import type { CubicBezier, EasingPreset } from '@genfeedai/types';
import { describe, expect, it } from 'vitest';
import {
  applySpeedCurve,
  EASING_PRESETS,
  evaluateBezier,
  getEasingDisplayName,
} from './easing';

describe('EASING_PRESETS', () => {
  const expectedPresets: EasingPreset[] = [
    'linear',
    'easeIn',
    'easeOut',
    'easeInOut',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
    'easeInCubic',
    'easeOutCubic',
    'easeInOutCubic',
    'easeInExpo',
    'easeOutExpo',
    'easeInOutExpo',
  ];

  it('has all 13 presets', () => {
    const keys = Object.keys(EASING_PRESETS);
    expect(keys).toHaveLength(13);
    for (const preset of expectedPresets) {
      expect(EASING_PRESETS).toHaveProperty(preset);
    }
  });

  it('all values are 4-element arrays', () => {
    for (const [, curve] of Object.entries(EASING_PRESETS)) {
      expect(Array.isArray(curve)).toBe(true);
      expect(curve).toHaveLength(4);
      for (const val of curve) {
        expect(typeof val).toBe('number');
      }
    }
  });

  it('linear preset is [0, 0, 1, 1]', () => {
    expect(EASING_PRESETS.linear).toEqual([0, 0, 1, 1]);
  });
});

describe('evaluateBezier', () => {
  const linear: CubicBezier = [0, 0, 1, 1];
  const easeIn: CubicBezier = [0.42, 0, 1, 1];
  const easeOut: CubicBezier = [0, 0, 0.58, 1];

  it('linear at t=0 returns ~0', () => {
    expect(evaluateBezier(0, linear)).toBeCloseTo(0, 4);
  });

  it('linear at t=1 returns ~1', () => {
    expect(evaluateBezier(1, linear)).toBeCloseTo(1, 4);
  });

  it('linear at t=0.5 returns ~0.5', () => {
    expect(evaluateBezier(0.5, linear)).toBeCloseTo(0.5, 1);
  });

  it('easeIn at t=0.5 returns less than 0.5 (slow start)', () => {
    const result = evaluateBezier(0.5, easeIn);
    expect(result).toBeLessThan(0.5);
  });

  it('easeOut at t=0.5 returns greater than 0.5 (fast start)', () => {
    const result = evaluateBezier(0.5, easeOut);
    expect(result).toBeGreaterThan(0.5);
  });

  it('all curves return ~0 at t=0 and ~1 at t=1', () => {
    for (const [, curve] of Object.entries(EASING_PRESETS)) {
      expect(evaluateBezier(0, curve as CubicBezier)).toBeCloseTo(0, 2);
      expect(evaluateBezier(1, curve as CubicBezier)).toBeCloseTo(1, 2);
    }
  });
});

describe('applySpeedCurve', () => {
  const linear: CubicBezier = [0, 0, 1, 1];

  it('linear curve with duration=10 and default sampleRate returns 61 elements', () => {
    const result = applySpeedCurve(10, linear);
    expect(result).toHaveLength(61);
  });

  it('first element is 0', () => {
    const result = applySpeedCurve(10, linear);
    expect(result[0]).toBeCloseTo(0, 4);
  });

  it('last element equals duration', () => {
    const result = applySpeedCurve(10, linear);
    expect(result[result.length - 1]).toBeCloseTo(10, 4);
  });

  it('linear curve produces evenly spaced timestamps', () => {
    const result = applySpeedCurve(10, linear);
    const expectedStep = 10 / 60;
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(i * expectedStep, 1);
    }
  });

  it('custom sampleRate=10 returns 11 elements', () => {
    const result = applySpeedCurve(10, linear, 10);
    expect(result).toHaveLength(11);
  });

  it('timestamps are monotonically increasing for linear', () => {
    const result = applySpeedCurve(10, linear);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
    }
  });
});

describe('getEasingDisplayName', () => {
  const cases: [EasingPreset, string][] = [
    ['linear', 'Linear'],
    ['easeIn', 'Ease In'],
    ['easeOut', 'Ease Out'],
    ['easeInOut', 'Ease In Out'],
    ['easeInQuad', 'Ease In Quadratic'],
    ['easeOutQuad', 'Ease Out Quadratic'],
    ['easeInOutQuad', 'Ease In Out Quadratic'],
    ['easeInCubic', 'Ease In Cubic'],
    ['easeOutCubic', 'Ease Out Cubic'],
    ['easeInOutCubic', 'Ease In Out Cubic'],
    ['easeInExpo', 'Ease In Exponential'],
    ['easeOutExpo', 'Ease Out Exponential'],
    ['easeInOutExpo', 'Ease In Out Exponential'],
  ];

  it.each(cases)('%s → %s', (preset, expected) => {
    expect(getEasingDisplayName(preset)).toBe(expected);
  });
});
