import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/enums', () => ({
  VideoEaseCurve: {
    EASE_IN_EXPO_OUT_CUBIC: 'ease-in-expo-out-cubic',
    EASE_IN_OUT_CUBIC: 'ease-in-out-cubic',
    EASE_IN_OUT_EXPO: 'ease-in-out-expo',
    EASE_IN_OUT_SINE: 'ease-in-out-sine',
    EASE_IN_QUART_OUT_QUAD: 'ease-in-quart-out-quad',
    LINEAR: 'linear',
  },
}));

import { VideoEaseCurve } from '@genfeedai/enums';
import {
  getBlendExpression,
  getEaseCurveExpression,
  getPanExpression,
  getZoomExpression,
} from './ease-curves.helper';

describe('ease-curves.helper', () => {
  describe('getEaseCurveExpression', () => {
    it('should return exponential ease for EASE_IN_OUT_EXPO', () => {
      const result = getEaseCurveExpression(VideoEaseCurve.EASE_IN_OUT_EXPO);
      expect(result).toContain('pow(2,');
      expect(result).toContain('if(lt(t,0.5)');
    });

    it('should return cubic out for EASE_IN_EXPO_OUT_CUBIC', () => {
      const result = getEaseCurveExpression(
        VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC,
      );
      expect(result).toContain('pow(2,');
      expect(result).toContain('pow(-2');
    });

    it('should return quart/quad for EASE_IN_QUART_OUT_QUAD', () => {
      const result = getEaseCurveExpression(
        VideoEaseCurve.EASE_IN_QUART_OUT_QUAD,
      );
      expect(result).toContain('16*pow');
      expect(result).toContain(',4)');
    });

    it('should return cubic for EASE_IN_OUT_CUBIC', () => {
      const result = getEaseCurveExpression(VideoEaseCurve.EASE_IN_OUT_CUBIC);
      expect(result).toContain('4*pow');
      expect(result).toContain(',3)');
    });

    it('should return sine for EASE_IN_OUT_SINE', () => {
      const result = getEaseCurveExpression(VideoEaseCurve.EASE_IN_OUT_SINE);
      expect(result).toContain('cos(PI');
    });

    it('should return linear fallback for unknown curve', () => {
      const result = getEaseCurveExpression('unknown' as VideoEaseCurve);
      expect(result).toBe('t');
    });

    it('should use custom tVariable', () => {
      const result = getEaseCurveExpression(
        VideoEaseCurve.EASE_IN_OUT_EXPO,
        'on/duration',
      );
      expect(result).toContain('on/duration');
      expect(result).not.toContain('if(lt(t,');
    });

    it('should default tVariable to t', () => {
      const result = getEaseCurveExpression(VideoEaseCurve.EASE_IN_OUT_SINE);
      expect(result).toContain('PI*t');
    });
  });

  describe('getZoomExpression', () => {
    it('should generate zoom expression with start and end', () => {
      const result = getZoomExpression(
        1.0,
        2.0,
        VideoEaseCurve.EASE_IN_OUT_CUBIC,
      );
      expect(result).toContain('1+1');
      expect(result).toContain('*(');
    });

    it('should use default tVariable on/duration', () => {
      const result = getZoomExpression(
        1.0,
        1.5,
        VideoEaseCurve.EASE_IN_OUT_EXPO,
      );
      expect(result).toContain('on/duration');
    });

    it('should use custom tVariable', () => {
      const result = getZoomExpression(
        1.0,
        2.0,
        VideoEaseCurve.EASE_IN_OUT_SINE,
        'progress',
      );
      expect(result).toContain('progress');
    });

    it('should handle zero zoom difference', () => {
      const result = getZoomExpression(
        1.5,
        1.5,
        VideoEaseCurve.EASE_IN_OUT_CUBIC,
      );
      expect(result).toContain('1.5+0');
    });
  });

  describe('getPanExpression', () => {
    it('should generate pan expression with dimension size', () => {
      const result = getPanExpression(
        0,
        1,
        'iw',
        VideoEaseCurve.EASE_IN_OUT_CUBIC,
      );
      expect(result).toContain('iw');
      expect(result).toContain('*(');
    });

    it('should handle different dimension sizes', () => {
      const result = getPanExpression(
        0.2,
        0.8,
        'ih',
        VideoEaseCurve.EASE_IN_OUT_SINE,
      );
      expect(result).toContain('ih');
    });

    it('should use default tVariable on/duration', () => {
      const result = getPanExpression(
        0,
        0.5,
        'iw',
        VideoEaseCurve.EASE_IN_OUT_EXPO,
      );
      expect(result).toContain('on/duration');
    });

    it('should use custom tVariable', () => {
      const result = getPanExpression(
        0,
        1,
        'iw',
        VideoEaseCurve.EASE_IN_OUT_CUBIC,
        'n/total',
      );
      expect(result).toContain('n/total');
    });
  });

  describe('getBlendExpression', () => {
    it('should generate blend expression with A and B', () => {
      const result = getBlendExpression(VideoEaseCurve.EASE_IN_OUT_CUBIC);
      expect(result).toContain('A*(1-');
      expect(result).toContain('+B*');
    });

    it('should default tVariable to t', () => {
      const result = getBlendExpression(VideoEaseCurve.EASE_IN_OUT_SINE);
      expect(result).toContain('PI*t');
    });

    it('should use custom tVariable', () => {
      const result = getBlendExpression(
        VideoEaseCurve.EASE_IN_OUT_EXPO,
        'progress',
      );
      expect(result).toContain('progress');
    });

    it('should use linear for unknown curve', () => {
      const result = getBlendExpression('unknown' as VideoEaseCurve);
      expect(result).toContain('A*(1-(t))+B*(t)');
    });
  });
});
