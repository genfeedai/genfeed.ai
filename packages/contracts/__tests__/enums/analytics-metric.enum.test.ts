import { describe, expect, it } from 'vitest';
import { AnalyticsMetric } from '../../src/enums/analytics-metric.enum';

describe('analytics-metric.enum', () => {
  describe('AnalyticsMetric', () => {
    it('should have 15 members', () => {
      expect(Object.values(AnalyticsMetric)).toHaveLength(15);
    });

    it('should have correct values', () => {
      expect(AnalyticsMetric.VIEWS).toBe('views');
      expect(AnalyticsMetric.VIDEO_VIEWS).toBe('videoViews');
      expect(AnalyticsMetric.IMPRESSIONS).toBe('impressions');
      expect(AnalyticsMetric.REACH).toBe('reach');
      expect(AnalyticsMetric.LIKES).toBe('likes');
      expect(AnalyticsMetric.COMMENTS).toBe('comments');
      expect(AnalyticsMetric.SHARES).toBe('shares');
      expect(AnalyticsMetric.SAVES).toBe('saves');
      expect(AnalyticsMetric.CLICKS).toBe('clicks');
      expect(AnalyticsMetric.WATCH_TIME).toBe('watchTime');
      expect(AnalyticsMetric.FOLLOWERS).toBe('followers');
      expect(AnalyticsMetric.SUBSCRIBERS).toBe('subscribers');
      expect(AnalyticsMetric.ENGAGEMENT_RATE).toBe('engagementRate');
      expect(AnalyticsMetric.POSTS).toBe('posts');
      expect(AnalyticsMetric.ENGAGEMENT).toBe('engagement');
    });
  });
});
