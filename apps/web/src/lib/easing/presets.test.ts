import type { CubicBezier, EasingPreset } from '@genfeedai/types';
import { describe, expect, it } from 'vitest';
import { applySpeedCurve, EASING_PRESETS, evaluateBezier, getEasingDisplayName } from './presets';

describe('EASING_PRESETS', () => {
  it('should have linear preset', () => {
    expect(EASING_PRESETS.linear).toEqual([0, 0, 1, 1]);
  });

  it('should have standard easing presets', () => {
    expect(EASING_PRESETS.easeIn).toBeDefined();
    expect(EASING_PRESETS.easeOut).toBeDefined();
    expect(EASING_PRESETS.easeInOut).toBeDefined();
  });

  it('should have quadratic easing presets', () => {
    expect(EASING_PRESETS.easeInQuad).toBeDefined();
    expect(EASING_PRESETS.easeOutQuad).toBeDefined();
    expect(EASING_PRESETS.easeInOutQuad).toBeDefined();
  });

  it('should have cubic easing presets', () => {
    expect(EASING_PRESETS.easeInCubic).toBeDefined();
    expect(EASING_PRESETS.easeOutCubic).toBeDefined();
    expect(EASING_PRESETS.easeInOutCubic).toBeDefined();
  });

  it('should have exponential easing presets', () => {
    expect(EASING_PRESETS.easeInExpo).toBeDefined();
    expect(EASING_PRESETS.easeOutExpo).toBeDefined();
    expect(EASING_PRESETS.easeInOutExpo).toBeDefined();
  });

  it('should have all presets as valid bezier curves', () => {
    for (const curve of Object.values(EASING_PRESETS)) {
      expect(curve).toHaveLength(4);
      expect(curve.every((v) => typeof v === 'number')).toBe(true);
    }
  });
});

describe('evaluateBezier', () => {
  describe('linear curve', () => {
    const linear: CubicBezier = [0, 0, 1, 1];

    it('should return 0 at t=0', () => {
      const result = evaluateBezier(0, linear);
      expect(result).toBeCloseTo(0, 5);
    });

    it('should return 1 at t=1', () => {
      const result = evaluateBezier(1, linear);
      expect(result).toBeCloseTo(1, 5);
    });

    it('should return 0.5 at t=0.5', () => {
      const result = evaluateBezier(0.5, linear);
      expect(result).toBeCloseTo(0.5, 2);
    });
  });

  describe('easeIn curve', () => {
    const easeIn = EASING_PRESETS.easeIn;

    it('should return 0 at t=0', () => {
      const result = evaluateBezier(0, easeIn);
      expect(result).toBeCloseTo(0, 5);
    });

    it('should return 1 at t=1', () => {
      const result = evaluateBezier(1, easeIn);
      expect(result).toBeCloseTo(1, 5);
    });

    it('should progress slower at start', () => {
      const result = evaluateBezier(0.5, easeIn);
      expect(result).toBeLessThan(0.5);
    });
  });

  describe('easeOut curve', () => {
    const easeOut = EASING_PRESETS.easeOut;

    it('should return 0 at t=0', () => {
      const result = evaluateBezier(0, easeOut);
      expect(result).toBeCloseTo(0, 5);
    });

    it('should return 1 at t=1', () => {
      const result = evaluateBezier(1, easeOut);
      expect(result).toBeCloseTo(1, 5);
    });

    it('should progress faster at start', () => {
      const result = evaluateBezier(0.5, easeOut);
      expect(result).toBeGreaterThan(0.5);
    });
  });

  describe('easeInOut curve', () => {
    const easeInOut = EASING_PRESETS.easeInOut;

    it('should return approximately 0.5 at t=0.5', () => {
      const result = evaluateBezier(0.5, easeInOut);
      expect(result).toBeCloseTo(0.5, 1);
    });
  });

  describe('edge cases', () => {
    it('should handle very small t values', () => {
      const result = evaluateBezier(0.001, EASING_PRESETS.linear);
      expect(result).toBeCloseTo(0.001, 2);
    });

    it('should handle t values close to 1', () => {
      const result = evaluateBezier(0.999, EASING_PRESETS.linear);
      expect(result).toBeCloseTo(0.999, 2);
    });
  });
});

describe('applySpeedCurve', () => {
  describe('with linear curve', () => {
    const linear: CubicBezier = [0, 0, 1, 1];

    it('should return correct number of samples', () => {
      const result = applySpeedCurve(10, linear, 60);
      expect(result).toHaveLength(61); // 0 to 60 inclusive
    });

    it('should start at 0', () => {
      const result = applySpeedCurve(10, linear, 60);
      expect(result[0]).toBeCloseTo(0, 5);
    });

    it('should end at duration', () => {
      const result = applySpeedCurve(10, linear, 60);
      expect(result[result.length - 1]).toBeCloseTo(10, 5);
    });

    it('should have linear progression', () => {
      const result = applySpeedCurve(10, linear, 10);
      expect(result[5]).toBeCloseTo(5, 1); // Middle point
    });
  });

  describe('with custom sample rate', () => {
    it('should use default sample rate of 60', () => {
      const result = applySpeedCurve(5, [0, 0, 1, 1]);
      expect(result).toHaveLength(61);
    });

    it('should handle custom sample rate', () => {
      const result = applySpeedCurve(5, [0, 0, 1, 1], 30);
      expect(result).toHaveLength(31);
    });

    it('should handle sample rate of 1', () => {
      const result = applySpeedCurve(5, [0, 0, 1, 1], 1);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(5, 5);
    });
  });

  describe('with easing curves', () => {
    it('should apply easeIn curve', () => {
      const result = applySpeedCurve(10, EASING_PRESETS.easeIn, 10);
      // EaseIn should have smaller values in first half
      expect(result[5]).toBeLessThan(5);
    });

    it('should apply easeOut curve', () => {
      const result = applySpeedCurve(10, EASING_PRESETS.easeOut, 10);
      // EaseOut should have larger values in first half
      expect(result[5]).toBeGreaterThan(5);
    });
  });

  describe('with different durations', () => {
    it('should scale timestamps to duration', () => {
      const result1 = applySpeedCurve(5, [0, 0, 1, 1], 10);
      const result2 = applySpeedCurve(10, [0, 0, 1, 1], 10);

      expect(result1[result1.length - 1]).toBeCloseTo(5, 5);
      expect(result2[result2.length - 1]).toBeCloseTo(10, 5);
    });

    it('should handle very short durations', () => {
      const result = applySpeedCurve(0.1, [0, 0, 1, 1], 10);
      expect(result[result.length - 1]).toBeCloseTo(0.1, 5);
    });

    it('should handle long durations', () => {
      const result = applySpeedCurve(3600, [0, 0, 1, 1], 10);
      expect(result[result.length - 1]).toBeCloseTo(3600, 5);
    });
  });
});

describe('getEasingDisplayName', () => {
  it('should return display name for linear', () => {
    expect(getEasingDisplayName('linear')).toBe('Linear');
  });

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
    expect(getEasingDisplayName('easeInOutExpo')).toBe('Ease In Out Exponential');
  });

  it('should return the preset name for unknown presets', () => {
    // Type assertion to test unknown preset
    const result = getEasingDisplayName('unknownPreset' as EasingPreset);
    expect(result).toBe('unknownPreset');
  });
});
