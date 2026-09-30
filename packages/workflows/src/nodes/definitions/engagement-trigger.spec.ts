import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGAGEMENT_TRIGGER_DATA } from './engagement-trigger';

describe('engagement-trigger node', () => {
  describe('DEFAULT_ENGAGEMENT_TRIGGER_DATA', () => {
    it('should have label set to Engagement Trigger', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.label).toBe('Engagement Trigger');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.status).toBe('idle');
    });

    it('should have type set to engagementTrigger', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.type).toBe('engagementTrigger');
    });

    it('should default platform to twitter', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.platform).toBe('twitter');
    });

    it('should default metricType to likes', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.metricType).toBe('likes');
    });

    it('should default threshold to 100', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.threshold).toBe(100);
    });

    it('should default postIds to empty array', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.postIds).toEqual([]);
    });

    it('should default tracking fields to null', () => {
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.lastCheckedPostId).toBeNull();
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.lastTriggeredAt).toBeNull();
      expect(DEFAULT_ENGAGEMENT_TRIGGER_DATA.lastMetricValue).toBeNull();
    });
  });
});
