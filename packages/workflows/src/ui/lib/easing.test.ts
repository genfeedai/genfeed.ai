import type { CubicBezier, EasingPreset } from '@genfeedai/contracts/types';
import { describe, expect, it } from 'vitest';
import { EASING_PRESETS, evaluateBezier } from './easing';

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
});

describe('evaluateBezier', () => {
  it('all curves return ~0 at t=0 and ~1 at t=1', () => {
    for (const [, curve] of Object.entries(EASING_PRESETS)) {
      expect(evaluateBezier(0, curve as CubicBezier)).toBeCloseTo(0, 2);
      expect(evaluateBezier(1, curve as CubicBezier)).toBeCloseTo(1, 2);
    }
  });
});
