import { describe, expect, it } from 'vitest';
import { AnalyticsMetric } from '../src/analytics-metric.enum';

describe('analytics-metric.enum', () => {
  describe('AnalyticsMetric', () => {
    it('should have 8 members', () => {
      expect(Object.values(AnalyticsMetric)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(AnalyticsMetric.VIEWS).toBe('views');
      expect(AnalyticsMetric.LIKES).toBe('likes');
      expect(AnalyticsMetric.COMMENTS).toBe('comments');
      expect(AnalyticsMetric.SHARES).toBe('shares');
      expect(AnalyticsMetric.SAVES).toBe('saves');
      expect(AnalyticsMetric.ENGAGEMENT_RATE).toBe('engagementRate');
      expect(AnalyticsMetric.POSTS).toBe('posts');
      expect(AnalyticsMetric.ENGAGEMENT).toBe('engagement');
    });
  });
});
