import type { CubicBezier, EasingPreset } from '@genfeedai/contracts/types';
import { describe, expect, it } from 'vitest';
import {
  applySpeedCurve,
  EASING_PRESETS,
  getEasingDisplayName,
} from './easing';

describe('EASING_PRESETS', () => {
  it('should have all presets as valid bezier curves', () => {
    for (const curve of Object.values(EASING_PRESETS)) {
      expect(curve).toHaveLength(4);
      expect(curve.every((v) => typeof v === 'number')).toBe(true);
    }
  });
});

describe('applySpeedCurve', () => {
  describe('with custom sample rate', () => {
    it('should handle sample rate of 1', () => {
      const result = applySpeedCurve(5, [0, 0, 1, 1], 1);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(5, 5);
    });
  });

  describe('with different durations', () => {
    it('should scale timestamps to duration', () => {
      const result1 = applySpeedCurve(5, [0, 0, 1, 1], 10);
      const result2 = applySpeedCurve(10, [0, 0, 1, 1], 10);

      expect(result1[result1.length - 1]).toBeCloseTo(5, 5);
      expect(result2[result2.length - 1]).toBeCloseTo(10, 5);
    });
  });
});

describe('getEasingDisplayName', () => {
  it('should return display name for standard easing', () => {
    expect(getEasingDisplayName('easeIn')).toBe('Ease In');
    expect(getEasingDisplayName('easeOut')).toBe('Ease Out');
    expect(getEasingDisplayName('easeInOut')).toBe('Ease In Out');
  });

  it('should return display name for quadratic easing', () => {
    expect(getEasingDisplayName('easeInQuad')).toBe('Ease In Quadratic');
    expect(getEasingDisplayName('easeOutQuad')).toBe('Ease Out Quadratic');
    expect(getEasingDisplayName('easeInOutQuad')).toBe('Ease In Out Quadratic');
  });

  it('should return display name for cubic easing', () => {
    expect(getEasingDisplayName('easeInCubic')).toBe('Ease In Cubic');
    expect(getEasingDisplayName('easeOutCubic')).toBe('Ease Out Cubic');
    expect(getEasingDisplayName('easeInOutCubic')).toBe('Ease In Out Cubic');
  });

  it('should return display name for exponential easing', () => {
    expect(getEasingDisplayName('easeInExpo')).toBe('Ease In Exponential');
    expect(getEasingDisplayName('easeOutExpo')).toBe('Ease Out Exponential');
    expect(getEasingDisplayName('easeInOutExpo')).toBe(
      'Ease In Out Exponential',
    );
  });

  it('should return the preset name for unknown presets', () => {
    // Type assertion to test unknown preset
    const result = getEasingDisplayName('unknownPreset' as EasingPreset);
    expect(result).toBe('unknownPreset');
  });
});
