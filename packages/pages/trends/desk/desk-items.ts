import type { ISourcePost, ITrendVideo } from '@genfeedai/interfaces';
import {
  getSourcePostRemixAvailability,
  getTrendRemixAvailability,
} from '@pages/trends/shared/remix-availability';
import type {
  DiscoveryDeskItem,
  DiscoveryDeskItemMetrics,
  DiscoveryDeskSource,
} from '@props/trends/discovery-desk.props';
import type { TrendContentItem } from '@props/trends/trends-page.props';

/**
 * The Discovery Desk always renders inside `DiscoveryRemixProvider`
 * (`discovery/layout.tsx`), so the pure adapters below assume a remix
 * surface is present and gate purely on platform + durable reference id —
 * the same inputs `getTrendRemixAvailability`/`getSourcePostRemixAvailability`
 * use everywhere else.
 */
const HAS_REMIX_SURFACE = true;

function sumMetrics(metrics: DiscoveryDeskItemMetrics): number {
  return (
    (metrics.views ?? 0) +
    (metrics.likes ?? 0) +
    (metrics.comments ?? 0) +
    (metrics.shares ?? 0)
  );
}

function computeVelocity(engagement: number, publishedAt?: string): number {
  if (!publishedAt) {
    return 0;
  }

  const publishedAtMs = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedAtMs)) {
    return 0;
  }

  const hoursSincePublished = (Date.now() - publishedAtMs) / (1000 * 60 * 60);
  if (hoursSincePublished <= 0) {
    return engagement;
  }

  return engagement / Math.max(hoursSincePublished, 1);
}

function normalizeSourcePostContentType(
  contentType: string,
): DiscoveryDeskItem['contentType'] {
  if (
    contentType === 'image' ||
    contentType === 'post' ||
    contentType === 'tweet' ||
    contentType === 'video'
  ) {
    return contentType;
  }
  return contentType === 'reel' ? 'video' : 'post';
}

export function toDeskItemFromTrend(item: TrendContentItem): DiscoveryDeskItem {
  const metrics: DiscoveryDeskItemMetrics = {
    comments: item.metrics?.comments,
    likes: item.metrics?.likes,
    shares: item.metrics?.shares,
    views: item.metrics?.views,
  };
  const engagement = sumMetrics(metrics);
  const hasDurableSourceReference = Boolean(item.sourceReferenceId);
  const { opensPrefilledRemix } = getTrendRemixAvailability(
    item.platform,
    hasDurableSourceReference,
    HAS_REMIX_SURFACE,
  );
  const source: DiscoveryDeskSource =
    item.sourceClassification?.sourceKind === 'owned_brand_reference'
      ? 'owned'
      : 'trends';

  return {
    authorHandle: item.authorHandle,
    contentType: item.contentType,
    engagement,
    id: item.id,
    key: `trend:${item.id}`,
    kind: 'trend',
    matchedTrends: item.matchedTrends,
    mediaUrl: item.mediaUrl,
    metrics,
    platform: item.platform,
    publishedAt: item.publishedAt,
    raw: { item, kind: 'trend' },
    remixSelector:
      opensPrefilledRemix && item.sourceReferenceId
        ? {
            kind: 'trend_reference',
            sourceReferenceId: item.sourceReferenceId,
            trendId: item.trendId,
          }
        : null,
    source,
    sourceUrl: item.sourceUrl,
    text: item.text,
    thumbnailUrl: item.thumbnailUrl,
    title: item.title,
    trendTopic: item.trendTopic,
    velocity: computeVelocity(engagement, item.publishedAt),
    virality: item.trendViralityScore,
  };
}

export function toDeskItemFromSourcePost(post: ISourcePost): DiscoveryDeskItem {
  const metrics: DiscoveryDeskItemMetrics = {
    comments: post.metrics?.comments,
    likes: post.metrics?.likes,
    shares: post.metrics?.shares,
    views: post.metrics?.views,
  };
  const engagement = sumMetrics(metrics);
  const { opensPrefilledRemix } = getSourcePostRemixAvailability(
    post.platform,
    HAS_REMIX_SURFACE,
  );

  return {
    authorHandle: post.authorHandle ?? undefined,
    contentType: normalizeSourcePostContentType(post.contentType),
    engagement,
    id: post.id,
    key: `source_post:${post.id}`,
    kind: 'source_post',
    matchedTrends: [],
    mediaUrl: post.mediaUrls?.[0],
    metrics,
    platform: post.platform,
    publishedAt: post.publishedAt ?? undefined,
    raw: { kind: 'source_post', post },
    remixSelector: opensPrefilledRemix
      ? { kind: 'source_post', sourcePostId: post.id }
      : null,
    source: 'following',
    sourceUrl: post.sourceUrl ?? undefined,
    text: post.text ?? undefined,
    thumbnailUrl: post.thumbnailUrl ?? undefined,
    title: undefined,
    velocity: computeVelocity(engagement, post.publishedAt ?? undefined),
    virality: 0,
  };
}

export function toDeskItemFromViralVideo(
  video: ITrendVideo,
): DiscoveryDeskItem {
  const metrics: DiscoveryDeskItemMetrics = {
    comments: video.comments ?? video.commentCount,
    likes: video.likes ?? video.likeCount,
    shares: video.shares ?? video.shareCount,
    views: video.views ?? video.viewCount,
  };
  const engagement = sumMetrics(metrics);

  return {
    authorHandle: video.creatorHandle,
    contentType: 'video',
    engagement,
    id: video.id,
    key: `viral_video:${video.id}`,
    kind: 'viral_video',
    matchedTrends: video.topic ? [video.topic] : [],
    mediaUrl: video.videoUrl,
    metrics,
    platform: video.platform,
    publishedAt: video.publishedAt,
    raw: { kind: 'viral_video', video },
    // Viral videos have no durable brand-remix source reference — they
    // surface as research context, not a remixable source, in trends-list
    // today (`ViralVideoCard` only offers "Use as context").
    remixSelector: null,
    source: 'trends',
    sourceUrl: video.videoUrl,
    text: video.description,
    thumbnailUrl: video.thumbnailUrl,
    title: video.title,
    trendTopic: video.topic,
    velocity: computeVelocity(engagement, video.publishedAt),
    virality: video.viralScore,
  };
}
