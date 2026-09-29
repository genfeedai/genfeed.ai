import { describe, expect, it } from 'vitest';
import { DEFAULT_TREND_VIDEO_INSPIRATION_DATA } from './trend-video-inspiration';

describe('trend-video-inspiration node', () => {
  describe('DEFAULT_TREND_VIDEO_INSPIRATION_DATA', () => {
    it('should default output fields to null or empty', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.prompt).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.hashtags).toEqual([]);
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.soundId).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.duration).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.aspectRatio).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.style).toBeNull();
    });
  });
});
