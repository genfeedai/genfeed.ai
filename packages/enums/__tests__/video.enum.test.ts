import { describe, expect, it } from 'vitest';
import { VideoEaseCurve, VideoTransition } from '../src/video.enum';

describe('video.enum', () => {
  describe('VideoTransition', () => {
    it('should have 11 members', () => {
      expect(Object.values(VideoTransition)).toHaveLength(11);
    });

    it('should have correct values', () => {
      expect(VideoTransition.NONE).toBe('none');
      expect(VideoTransition.FADE).toBe('fade');
      expect(VideoTransition.DISSOLVE).toBe('dissolve');
      expect(VideoTransition.WIPELEFT).toBe('wipeleft');
      expect(VideoTransition.WIPERIGHT).toBe('wiperight');
      expect(VideoTransition.WIPEUP).toBe('wipeup');
      expect(VideoTransition.WIPEDOWN).toBe('wipedown');
      expect(VideoTransition.CIRCLEOPEN).toBe('circleopen');
      expect(VideoTransition.CIRCLECLOSE).toBe('circleclose');
      expect(VideoTransition.SLIDELEFT).toBe('slideleft');
      expect(VideoTransition.SLIDERIGHT).toBe('slideright');
    });
  });

  describe('VideoEaseCurve', () => {
    it('should have 5 members', () => {
      expect(Object.values(VideoEaseCurve)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(VideoEaseCurve.EASE_IN_OUT_EXPO).toBe('easyinoutexpo');
      expect(VideoEaseCurve.EASE_IN_EXPO_OUT_CUBIC).toBe('easyinexpooutcubic');
      expect(VideoEaseCurve.EASE_IN_QUART_OUT_QUAD).toBe('easyinquartoutquad');
      expect(VideoEaseCurve.EASE_IN_OUT_CUBIC).toBe('easyinoutcubic');
      expect(VideoEaseCurve.EASE_IN_OUT_SINE).toBe('easyinoutsine');
    });
  });
});
