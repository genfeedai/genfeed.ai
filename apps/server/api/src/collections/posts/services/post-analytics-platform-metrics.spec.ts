import {
  mapBreakoutExposureMetrics,
  mapInstagramPostMetrics,
  mapTikTokPostMetrics,
  mapTwitterPostMetrics,
  mapYouTubePostMetrics,
} from '@api/collections/posts/services/post-analytics-platform-metrics';
import { Platform } from '@genfeedai/contracts';
import { captureLearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { describe, expect, it } from 'vitest';

describe('provider learning availability survives descriptive metric mapping', () => {
  it.each([Platform.YOUTUBE, Platform.TIKTOK])(
    'uses observed %s publication views without manufacturing organic provenance',
    (platform) => {
      for (const views of [0, 1200]) {
        const learningMetrics = captureLearningMetrics(
          { publication_views: views },
          { videoViews: 'publication_views' },
        );
        const input = {
          views,
          likes: 0,
          comments: 0,
          shares: 0,
          learningMetrics,
        };
        const mapped =
          platform === Platform.YOUTUBE
            ? mapYouTubePostMetrics(input)
            : mapTikTokPostMetrics(input);
        expect(mapBreakoutExposureMetrics(mapped, platform).views).toEqual({
          availability: 'observed',
          value: views,
          source: `${platform}:aggregate:publication_views`,
          scope: 'aggregate',
        });
        expect(mapped.learningMetrics).toBe(learningMetrics);
      }
    },
  );
  it.each([Platform.YOUTUBE, Platform.TIKTOK])(
    'keeps %s missing provider counters distinct from the daily fallback zero',
    (platform) => {
      const input = {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        learningMetrics: captureLearningMetrics(
          {},
          { videoViews: 'missing_views' },
        ),
      };
      const mapped =
        platform === Platform.YOUTUBE
          ? mapYouTubePostMetrics(input)
          : mapTikTokPostMetrics(input);
      expect(mapBreakoutExposureMetrics(mapped, platform).views).toMatchObject({
        availability: 'unavailable',
        value: null,
        scope: 'unknown',
      });
      expect(mapped.totalViews).toBe(0);
    },
  );
  it('preserves explicit X field-group provenance and existing Instagram post counters', () => {
    const exposures = {
      views: {
        availability: 'observed' as const,
        value: 20,
        source: 'x:paid:impression_count',
        scope: 'paid' as const,
      },
    };
    const twitter = mapTwitterPostMetrics({
      views: 20,
      likes: 0,
      comments: 0,
      breakoutExposures: exposures,
    });
    expect(mapBreakoutExposureMetrics(twitter, Platform.TWITTER).views).toEqual(
      exposures.views,
    );
    const instagram = mapInstagramPostMetrics({
      views: 30,
      likes: 0,
      comments: 0,
      learningMetrics: captureLearningMetrics(
        { views: 30 },
        { views: 'views' },
      ),
    });
    expect(
      mapBreakoutExposureMetrics(instagram, Platform.INSTAGRAM).views,
    ).toEqual({
      availability: 'observed',
      value: 30,
      source: 'instagram:aggregate:views',
      scope: 'aggregate',
    });
  });
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
