import { describe, expect, it } from 'vitest';
import { DEFAULT_TREND_VIDEO_INSPIRATION_DATA } from './trend-video-inspiration';

describe('trend-video-inspiration node', () => {
  describe('DEFAULT_TREND_VIDEO_INSPIRATION_DATA', () => {
    it('should have label set to Trend Video Inspiration', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.label).toBe(
        'Trend Video Inspiration',
      );
    });

    it('should default to idle status', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.status).toBe('idle');
    });

    it('should default platform to tiktok', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.platform).toBe('tiktok');
    });

    it('should default inspirationStyle to inspired_by', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.inspirationStyle).toBe(
        'inspired_by',
      );
    });

    it('should default auto to true', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.auto).toBe(true);
    });

    it('should default includeOriginalHook to false', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.includeOriginalHook).toBe(
        false,
      );
    });

    it('should default minViralScore to 70', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.minViralScore).toBe(70);
    });

    it('should default output fields to null or empty', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.prompt).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.hashtags).toEqual([]);
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.soundId).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.duration).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.aspectRatio).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.style).toBeNull();
    });

    it('should default source info to null', () => {
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.sourceTrendTitle).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.sourceTrendUrl).toBeNull();
      expect(DEFAULT_TREND_VIDEO_INSPIRATION_DATA.trendId).toBeNull();
    });
  });
});
