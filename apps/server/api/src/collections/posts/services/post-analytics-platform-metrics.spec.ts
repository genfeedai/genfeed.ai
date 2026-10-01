import {
  mapTikTokPostMetrics,
  mapYouTubePostMetrics,
} from '@api/collections/posts/services/post-analytics-platform-metrics';
import { captureLearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { describe, expect, it } from 'vitest';

describe('provider learning availability survives descriptive metric mapping', () => {
  it('preserves explicitly observed zero and missing action coverage on YouTube', () => {
    const learningMetrics = captureLearningMetrics(
      { viewCount: 0, likeCount: 0 },
      {
        videoViews: 'viewCount',
        likes: 'likeCount',
        comments: 'commentCount',
      },
    );
    const mapped = mapYouTubePostMetrics({
      comments: 0,
      likes: 0,
      views: 0,
      learningMetrics,
    });
    expect(mapped.learningMetrics).toBe(learningMetrics);
    expect(mapped.learningMetrics?.metrics.videoViews?.availability).toBe(
      'observed',
    );
    expect(mapped.learningMetrics?.metrics.comments?.availability).toBe(
      'unavailable',
    );
    expect(mapped.learningMetrics?.isPaid).toBeUndefined();
    expect(mapped.totalComments).toBe(0);
  });
  it('retains missing watch evidence despite the daily TikTok view fallback', () => {
    const learningMetrics = captureLearningMetrics(
      { view_count: 20 },
      {
        videoViews: 'view_count',
        averageWatchTimeSeconds: 'average_watch_time',
      },
    );
    const mapped = mapTikTokPostMetrics({
      comments: 0,
      likes: 0,
      shares: 0,
      views: 20,
      learningMetrics,
    });
    expect(mapped.learningMetrics).toBe(learningMetrics);
    expect(
      mapped.learningMetrics?.metrics.averageWatchTimeSeconds?.availability,
    ).toBe('unavailable');
    expect(mapped.averageWatchTimeSeconds).toBeNull();
  });
});
