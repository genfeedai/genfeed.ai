import type { Platform } from '@genfeedai/contracts';
import type {
  BreakoutExposureEvidence,
  BreakoutExposureMetric,
} from '@genfeedai/contracts/interfaces';
import type { LearningMetrics } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
export interface UpdateTodayAnalyticsMetrics {
  breakoutExposures?: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  >;
  learningMetrics?: LearningMetrics;
  averageWatchTimeSeconds?: number | null;
  clicks?: number | null;
  credentialId?: string | null;
  isPinned?: boolean | null;
  isPromoted?: boolean | null;
  impressions?: number | null;
  metricAvailability?: Record<string, string>;
  reach?: number | null;
  totalComments: number;
  totalLikes: number;
  totalSaves?: number;
  totalShares?: number;
  totalViews: number;
  videoViews?: number | null;
  watchTimeSeconds?: number | null;
}

export function mapBreakoutExposureMetrics(
  metrics: UpdateTodayAnalyticsMetrics,
  platform: Platform,
): Partial<Record<BreakoutExposureMetric, BreakoutExposureEvidence>> {
  const exposures: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  > = {};
  for (const metric of ['views', 'impressions'] as const) {
    const evidence = metrics.learningMetrics?.metrics[metric];
    exposures[metric] = metrics.breakoutExposures?.[metric] ?? {
      availability: evidence?.availability ?? 'unavailable',
      value: evidence?.value ?? null,
      source: `${platform}:aggregate:${evidence?.source ?? metric}`,
      scope: evidence?.availability === 'observed' ? 'aggregate' : 'unknown',
    };
  }
  return exposures;
}

export interface YouTubePostMetrics {
  learningMetrics?: LearningMetrics;
  isPinned?: boolean | null;
  isPromoted?: boolean | null;
  averageViewDuration?: number;
  averageViewPercentage?: number;
  clickThroughRate?: number;
  comments: number;
  dislikes?: number;
  duration?: number;
  engagementRate?: number;
  estimatedMinutesWatched?: number;
  favorites?: number;
  impressions?: number;
  likes: number;
  mediaType?: 'video' | 'short';
  shares?: number;
  subscribersGained?: number;
  subscribersLost?: number;
  views: number;
}

export interface TikTokPostMetrics {
  learningMetrics?: LearningMetrics;
  isPinned?: boolean | null;
  isPromoted?: boolean | null;
  averagePlayTime?: number;
  comments: number;
  engagementRate?: number;
  likes: number;
  reach?: number;
  saves?: number;
  shares: number;
  totalPlayTime?: number;
  views: number;
}

function availability(value: number | null): 'observed' | 'unavailable' {
  return value === null ? 'unavailable' : 'observed';
}

/** These provider counters describe the one published video, not an arbitrary attached media asset. */
function publishedVideoExposure(
  analytics: YouTubePostMetrics | TikTokPostMetrics,
  platform: 'youtube' | 'tiktok',
): Partial<Record<BreakoutExposureMetric, BreakoutExposureEvidence>> {
  const evidence = analytics.learningMetrics?.metrics.videoViews;
  return {
    views: {
      availability: evidence?.availability ?? 'unavailable',
      value: evidence?.value ?? null,
      source: `${platform}:aggregate:${evidence?.source ?? 'videoViews'}`,
      scope: evidence?.availability === 'observed' ? 'aggregate' : 'unknown',
    },
  };
}

export function mapYouTubePostMetrics(
  analytics: YouTubePostMetrics,
): UpdateTodayAnalyticsMetrics {
  const averageWatchTimeSeconds = analytics.averageViewDuration ?? null;
  const impressions = analytics.impressions ?? null;
  const watchTimeSeconds =
    analytics.estimatedMinutesWatched == null
      ? null
      : analytics.estimatedMinutesWatched * 60;
  return {
    breakoutExposures: publishedVideoExposure(analytics, 'youtube'),
    learningMetrics: analytics.learningMetrics,
    isPinned: analytics.isPinned ?? null,
    isPromoted: analytics.isPromoted ?? null,
    averageWatchTimeSeconds,
    impressions,
    metricAvailability: {
      averageWatchTimeSeconds: availability(averageWatchTimeSeconds),
      impressions: availability(impressions),
      videoViews: 'observed',
      views: 'observed',
      watchTimeSeconds: availability(watchTimeSeconds),
    },
    totalComments: analytics.comments,
    totalLikes: analytics.likes,
    totalShares: analytics.shares || 0,
    totalViews: analytics.views,
    videoViews: analytics.views,
    watchTimeSeconds,
  };
}

export function mapTikTokPostMetrics(
  analytics: TikTokPostMetrics,
): UpdateTodayAnalyticsMetrics {
  const averageWatchTimeSeconds = analytics.averagePlayTime ?? null;
  const reach = analytics.reach ?? null;
  const watchTimeSeconds = analytics.totalPlayTime ?? null;
  return {
    breakoutExposures: publishedVideoExposure(analytics, 'tiktok'),
    learningMetrics: analytics.learningMetrics,
    isPinned: analytics.isPinned ?? null,
    isPromoted: analytics.isPromoted ?? null,
    averageWatchTimeSeconds,
    metricAvailability: {
      averageWatchTimeSeconds: availability(averageWatchTimeSeconds),
      reach: availability(reach),
      videoViews: 'observed',
      views: 'observed',
      watchTimeSeconds: availability(watchTimeSeconds),
    },
    reach,
    totalComments: analytics.comments,
    totalLikes: analytics.likes,
    totalSaves: analytics.saves || 0,
    totalShares: analytics.shares,
    totalViews: analytics.views,
    videoViews: analytics.views,
    watchTimeSeconds,
  };
}

export interface TwitterPostMetrics {
  learningMetrics?: LearningMetrics;
  breakoutExposures?: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  >;
  isPinned?: boolean | null;
  isPromoted?: boolean | null;
  views: number;
  likes: number;
  comments: number;
  retweets?: number;
  bookmarks?: number;
  quotes?: number;
  impressions?: number;
  engagementRate?: number;
  mediaType?: 'text' | 'image' | 'video' | 'mixed';
}

export function mapTwitterPostMetrics(
  analytics: TwitterPostMetrics,
): UpdateTodayAnalyticsMetrics {
  return {
    learningMetrics: analytics.learningMetrics,
    breakoutExposures: analytics.breakoutExposures,
    impressions: analytics.impressions ?? null,
    isPinned: analytics.isPinned ?? analytics.learningMetrics?.isPinned ?? null,
    isPromoted:
      analytics.isPromoted ?? analytics.learningMetrics?.isPaid ?? null,
    metricAvailability: {
      impressions:
        analytics.learningMetrics?.metrics.impressions?.availability ??
        (analytics.impressions == null ? 'unavailable' : 'observed'),
      views:
        analytics.learningMetrics?.metrics.views?.availability ?? 'observed',
    },
    totalComments: analytics.comments,
    totalLikes: analytics.likes,
    totalSaves: analytics.bookmarks ?? 0,
    totalShares: analytics.retweets || 0,
    totalViews: analytics.views,
  };
}

export interface InstagramPostMetrics {
  learningMetrics?: LearningMetrics;
  isPinned?: boolean | null;
  isPromoted?: boolean | null;
  views?: number;
  likes: number;
  comments: number;
  shares?: number;
  saves?: number;
  impressions?: number;
  reach?: number;
  engagementRate?: number;
  mediaType?: 'image' | 'video' | 'carousel' | 'reel' | 'story';
}

export function mapInstagramPostMetrics(
  analytics: InstagramPostMetrics,
): UpdateTodayAnalyticsMetrics {
  return {
    learningMetrics: analytics.learningMetrics,
    impressions: analytics.impressions ?? null,
    metricAvailability: {
      impressions: analytics.impressions == null ? 'unavailable' : 'observed',
      reach: analytics.reach == null ? 'unavailable' : 'observed',
      views:
        analytics.learningMetrics?.metrics.views?.availability ?? 'unavailable',
    },
    reach: analytics.reach ?? null,
    totalComments: analytics.comments,
    totalLikes: analytics.likes,
    totalSaves: analytics.saves || 0,
    totalShares: analytics.shares || 0,
    totalViews: analytics.views ?? 0,
    videoViews: analytics.views ?? null,
  };
}

/** Daily rows exclude the separate immutable learning and breakout evidence payloads. */
export function mapDailyPostMetrics(
  metrics: UpdateTodayAnalyticsMetrics,
  credentialId: string,
) {
  const dailyMetrics = { ...metrics };
  delete dailyMetrics.learningMetrics;
  delete dailyMetrics.breakoutExposures;
  return {
    ...dailyMetrics,
    credentialId,
    isPinned: metrics.isPinned ?? null,
    isPromoted: metrics.isPromoted ?? null,
    metricAvailability: {
      views:
        Number.isSafeInteger(metrics.totalViews) && metrics.totalViews >= 0
          ? 'observed'
          : 'unavailable',
      ...metrics.metricAvailability,
    },
  };
}
