import { describe, expect, it } from 'vitest';
import { DEFAULT_TREND_HASHTAG_INSPIRATION_DATA } from './trend-hashtag-inspiration';

describe('trend-hashtag-inspiration node', () => {
  describe('DEFAULT_TREND_HASHTAG_INSPIRATION_DATA', () => {
    it('should default output fields to null or empty', () => {
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.prompt).toBeNull();
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.hashtags).toEqual([]);
      expect(DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.contentType).toBeNull();
      expect(
        DEFAULT_TREND_HASHTAG_INSPIRATION_DATA.recommendedPlatform,
      ).toBeNull();
    });
  });
});
