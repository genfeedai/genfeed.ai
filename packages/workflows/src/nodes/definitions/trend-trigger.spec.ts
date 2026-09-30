import { describe, expect, it } from 'vitest';
import { DEFAULT_TREND_TRIGGER_DATA } from './trend-trigger';

describe('trend-trigger node', () => {
  describe('DEFAULT_TREND_TRIGGER_DATA', () => {
    it('should have label set to Trend Trigger', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.label).toBe('Trend Trigger');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.status).toBe('idle');
    });

    it('should default platform to tiktok', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.platform).toBe('tiktok');
    });

    it('should default trendType to video', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.trendType).toBe('video');
    });

    it('should default minViralScore to 70', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.minViralScore).toBe(70);
    });

    it('should default checkFrequency to 1hr', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.checkFrequency).toBe('1hr');
    });

    it('should default keywords and excludeKeywords to empty arrays', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.keywords).toEqual([]);
      expect(DEFAULT_TREND_TRIGGER_DATA.excludeKeywords).toEqual([]);
    });

    it('should default tracking fields to null', () => {
      expect(DEFAULT_TREND_TRIGGER_DATA.lastTriggeredAt).toBeNull();
      expect(DEFAULT_TREND_TRIGGER_DATA.lastTrendId).toBeNull();
      expect(DEFAULT_TREND_TRIGGER_DATA.lastTrendTopic).toBeNull();
    });
  });
});
