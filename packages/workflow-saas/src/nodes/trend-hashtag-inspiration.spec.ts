import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TREND_HASHTAG_INSPIRATION_DATA,
  trendHashtagInspirationNodeDefinition,
} from './trend-hashtag-inspiration';

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

  describe('trendHashtagInspirationNodeDefinition', () => {
    it('should have type trendHashtagInspiration', () => {
      expect(trendHashtagInspirationNodeDefinition.type).toBe(
        'trendHashtagInspiration',
      );
    });

    it('should be in ai category', () => {
      expect(trendHashtagInspirationNodeDefinition.category).toBe('ai');
    });

    it('should have label Trend Hashtag Inspiration', () => {
      expect(trendHashtagInspirationNodeDefinition.label).toBe(
        'Trend Hashtag Inspiration',
      );
    });

    it('should have optional hashtag input', () => {
      expect(trendHashtagInspirationNodeDefinition.inputs).toHaveLength(1);
      expect(trendHashtagInspirationNodeDefinition.inputs[0].id).toBe(
        'hashtag',
      );
      expect(trendHashtagInspirationNodeDefinition.inputs[0].optional).toBe(
        true,
      );
    });

    it('should output prompt, hashtags, contentType, and platform', () => {
      const outputIds = trendHashtagInspirationNodeDefinition.outputs.map(
        (o) => o.id,
      );
      expect(outputIds).toEqual([
        'prompt',
        'hashtags',
        'contentType',
        'platform',
      ]);
    });

    it('should reference default data', () => {
      expect(trendHashtagInspirationNodeDefinition.defaultData).toBe(
        DEFAULT_TREND_HASHTAG_INSPIRATION_DATA,
      );
    });
  });
});
