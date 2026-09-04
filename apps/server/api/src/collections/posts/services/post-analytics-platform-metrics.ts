export interface UpdateTodayAnalyticsMetrics {
  averageWatchTimeSeconds?: number | null;
  clicks?: number | null;
  credentialId?: string | null;
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

export interface YouTubePostMetrics {
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
    averageWatchTimeSeconds,
    impressions,
    metricAvailability: {
      averageWatchTimeSeconds: availability(averageWatchTimeSeconds),
      impressions: availability(impressions),
      videoViews: 'observed',
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
    averageWatchTimeSeconds,
    metricAvailability: {
      averageWatchTimeSeconds: availability(averageWatchTimeSeconds),
      reach: availability(reach),
      videoViews: 'observed',
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
