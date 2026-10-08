import { getInstagramErrorCode as getMetaGraphErrorCode } from '@api/services/integrations/instagram/utils/instagram-error.util';
import {
  captureLearningMetrics,
  type LearningMetrics,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type {
  FacebookInsight,
  FacebookReaction,
} from '@genfeedai/contracts/interfaces/integrations/facebook.interface';

export type FacebookAnalyticsResult = {
  learningMetrics?: LearningMetrics;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
  impressions?: number;
  engagementRate?: number;
  reactions?: {
    like?: number;
    love?: number;
    wow?: number;
    haha?: number;
    sad?: number;
    angry?: number;
  };
};

type FacebookAnalyticsResponse = {
  id?: string;
  reactions?: { summary?: { total_count?: number }; data?: FacebookReaction[] };
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  insights?: { data?: FacebookInsight[] };
  video_insights?: { data?: FacebookInsight[] };
};

export function parseFacebookAnalytics(
  data: FacebookAnalyticsResponse,
  postId: string,
  isVideo = false,
): FacebookAnalyticsResult {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.id !== 'string' ||
    data.id !== postId
  )
    throw new Error('malformed_provider_response');
  const insights = (isVideo ? data.video_insights : data.insights)?.data || [];
  const viewMetric = isVideo ? 'total_video_views' : 'post_media_view';
  const likes = isVideo ? data.likes : data.reactions;
  const likeSource = isVideo
    ? 'likes.summary.total_count'
    : 'reactions.summary.total_count';

  // Extract insights metrics
  const getInsightValue = (metricName: string): number => {
    const insight = (insights as FacebookInsight[]).find(
      (i) => i.name === metricName,
    );
    return insight?.values?.[0]?.value || 0;
  };

  const views = getInsightValue(viewMetric);
  const interactions =
    (likes?.summary?.total_count ?? 0) +
    (data.comments?.summary?.total_count ?? 0) +
    (data.shares?.count ?? 0);

  // Calculate engagement rate
  const engagementRate = views > 0 ? (interactions / views) * 100 : 0;

  // Extract reaction breakdown
  const reactions: Record<string, number> = {};
  if (data.reactions?.data) {
    (data.reactions.data as FacebookReaction[]).forEach((reaction) => {
      const type = reaction.type.toLowerCase();
      reactions[type] = (reactions[type] || 0) + 1;
    });
  }

  const rawInsights = Object.fromEntries(
    (insights as FacebookInsight[]).map((insight) => [
      insight.name,
      insight.values?.[0]?.value,
    ]),
  );
  return {
    learningMetrics: captureLearningMetrics(
      {
        [viewMetric]: rawInsights[viewMetric],
        [likeSource]: likes?.summary?.total_count,
        'comments.summary.total_count': data.comments?.summary?.total_count,
        'shares.count': data.shares?.count,
      },
      {
        views: viewMetric,
        likes: likeSource,
        comments: 'comments.summary.total_count',
        shares: 'shares.count',
      },
    ),
    comments: data.comments?.summary?.total_count || 0,
    engagementRate:
      engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
    likes: likes?.summary?.total_count || 0,
    reactions: Object.keys(reactions).length > 0 ? reactions : undefined,
    shares: data.shares?.count || 0,
    views,
  };
}

export function failedFacebookAnalytics(
  error: unknown,
  isVideo = false,
): FacebookAnalyticsResult {
  const response =
    error && typeof error === 'object' && 'response' in error
      ? error.response
      : null;
  const status =
    response &&
    typeof response === 'object' &&
    'status' in response &&
    typeof response.status === 'number'
      ? response.status
      : null;
  const graphCode = getMetaGraphErrorCode(error);
  const rateLimited =
    status === 429 ||
    (graphCode !== undefined && [4, 17, 32, 613].includes(graphCode));
  const unauthorized =
    !rateLimited &&
    (status === 401 ||
      status === 403 ||
      (graphCode !== undefined &&
        [190, 102, 10, 200, 294].includes(graphCode)));
  const permanent =
    !rateLimited &&
    (unauthorized || (status !== null && [404, 405, 410].includes(status)));
  return {
    learningMetrics: {
      collection: {
        version: 1,
        outcome: permanent ? 'terminal_unavailable' : 'retryable_failure',
        reasonCode: rateLimited
          ? 'rate_limited'
          : unauthorized
            ? 'unauthorized'
            : status === 404 || status === 410
              ? 'publication_unavailable'
              : status === 405
                ? 'unsupported_metric'
                : 'provider_fetch_failed',
      },
      metrics: {
        views: {
          availability: 'failed',
          source: isVideo ? 'total_video_views' : 'post_media_view',
        },
        likes: {
          availability: 'failed',
          source: isVideo ? 'likes.summary' : 'reactions.summary',
        },
        comments: { availability: 'failed', source: 'comments.summary' },
        shares: { availability: 'failed', source: 'shares.count' },
      },
    },
    comments: 0,
    likes: 0,
    shares: 0,
    views: 0,
  };
}
