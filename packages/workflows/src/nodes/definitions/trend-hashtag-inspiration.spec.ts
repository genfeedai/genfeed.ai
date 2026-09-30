import { describe, expect, it } from 'vitest';
import { DEFAULT_TREND_HASHTAG_INSPIRATION_DATA } from './trend-hashtag-inspiration';

describe('trend-hashtag-inspiration node', () => {
  describe('DEFAULT_TREND_HASHTAG_INSPIRATION_DATA', () => {
    it('should have label set to Trend Hashtag Inspiration', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.label).toBe(
        'Trend Hashtag Inspiration',
      );
    });

    it('should default to idle status', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.status).toBe('idle');
    });

    it('should default platform to tiktok', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.platform).toBe('tiktok');
    });

    it('should default auto to true', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.auto).toBe(true);
    });

    it('should default contentPreference to video', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.contentPreference).toBe(
        'video',
      );
    });

    it('should default output fields to null or empty', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.prompt).toBeNull();
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.hashtags).toEqual([]);
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.contentType).toBeNull();
      expect(
        DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.recommendedPlatform,
      ).toBeNull();
    });

    it('should default source info to null', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.hashtag).toBeNull();
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.sourceHashtag).toBeNull();
      expect(
        DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.hashtagPostCount,
      ).toBeNull();
    });
  });
});
