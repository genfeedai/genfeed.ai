import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendSourceItem } from '@api/collections/trends/interfaces/trend.interfaces';
import { TREND_SOURCE_PREVIEW_LIMIT } from '@api/collections/trends/services/modules/trend-source.constants';
import type {
  ApifyInstagramPost,
  ApifyNormalizedTweet,
  ApifyRedditPost,
  ApifyTikTokVideo,
  ApifyYouTubeVideo,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { Injectable } from '@nestjs/common';

/**
 * Owns the trend "source item" subsystem: live Apify fetch + per-platform
 * normalization, fallback synthesis, and the stored source-preview accessors.
 *
 * Extracted from TrendsService (issue #752). The five previously copy-pasted
 * per-platform fetchers are collapsed behind a single dispatch table in
 * {@link fetchTrendSourceItems}.
 */
@Injectable()
export class TrendSourceItemsService {
  constructor(private readonly apifyService: ApifyService) {}

  /**
   * Build the source-reference sync input for a trend from its stored preview.
   */
  toSyncTrendInput(trend: TrendEntity): {
    id: string;
    mentions: number;
    platform: string;
    sourcePreview: TrendSourceItem[];
    sourcePreviewState: 'live' | 'fallback' | 'empty';
    topic: string;
    viralityScore: number;
  } {
    const sourcePreview = this.getStoredTrendSourcePreview(
      trend,
      TREND_SOURCE_PREVIEW_LIMIT,
    );

    return {
      id: String(trend.id),
      mentions: trend.mentions,
      platform: trend.platform,
      sourcePreview,
      sourcePreviewState: this.getStoredTrendSourcePreviewState(
        trend,
        sourcePreview,
      ),
      topic: trend.topic,
      viralityScore: trend.viralityScore,
    };
  }

  /**
   * Fetch live source items for a trend from Apify, dispatching by platform.
   *
   * A single dispatch table replaces the previous five near-identical
   * `fetch{Platform}SourceItems` methods: each shares the same shape of
   * search-term guard, an Apify call, then `.map(mapper).filter(non-null)`.
   */
  async fetchTrendSourceItems(
    trend: TrendEntity,
    limit: number,
  ): Promise<TrendSourceItem[]> {
    const searchTerm = this.getTrendSearchTerm(trend);
    if (!searchTerm) {
      return [];
    }

    const fetchers: Record<string, () => Promise<TrendSourceItem[]>> = {
      instagram: async () => {
        const posts = await this.apifyService.searchInstagramByHashtag(
          searchTerm,
          { limit },
        );
        return this.normalizeSourceItems(posts, (post) =>
          this.mapInstagramPostToSourceItem(post),
        );
      },
      reddit: async () => {
        const posts = await this.apifyService.searchRedditPosts(searchTerm, {
          limit,
        });
        return this.normalizeSourceItems(posts, (post) =>
          this.mapRedditPostToSourceItem(post),
        );
      },
      tiktok: async () => {
        const videos = await this.apifyService.searchTikTokByHashtag(
          searchTerm,
          { limit },
        );
        return this.normalizeSourceItems(videos, (video) =>
          this.mapTikTokVideoToSourceItem(video),
        );
      },
      twitter: async () => {
        const tweets = await this.apifyService.searchTwitterTweets(searchTerm, {
          limit,
        });
        return this.normalizeSourceItems(tweets, (tweet) =>
          this.mapTweetToSourceItem(tweet),
        );
      },
      youtube: async () => {
        const videos = await this.apifyService.searchYouTubeVideos(searchTerm, {
          limit,
        });
        return this.normalizeSourceItems(videos, (video) =>
          this.mapYouTubeVideoToSourceItem(video),
        );
      },
    };

    const fetcher = fetchers[trend.platform];
    return fetcher ? fetcher() : [];
  }

  /**
   * Synthesize fallback source items from trend metadata when no live items
   * are available.
   */
  buildFallbackTrendSourceItems(trend: TrendEntity): TrendSourceItem[] {
    const mediaUrl =
      typeof trend.metadata?.videoUrl === 'string'
        ? trend.metadata.videoUrl
        : undefined;
    const sourceUrls = Array.isArray(trend.metadata?.urls)
      ? trend.metadata.urls.filter(
          (url): url is string => typeof url === 'string' && !!url,
        )
      : [];
    const resolvedSourceUrls =
      sourceUrls.length > 0 ? sourceUrls : mediaUrl ? [mediaUrl] : [];

    return resolvedSourceUrls.map((sourceUrl, index) => ({
      authorHandle:
        typeof trend.metadata?.creatorHandle === 'string'
          ? trend.metadata.creatorHandle
          : undefined,
      contentType:
        trend.platform === 'twitter'
          ? 'tweet'
          : trend.metadata?.videoUrl
            ? 'video'
            : 'post',
      id: `${trend.id}-fallback-${index + 1}`,
      mediaUrl,
      platform: trend.platform,
      publishedAt: trend.createdAt?.toISOString(),
      sourceUrl,
      text:
        typeof trend.metadata?.sampleContent === 'string'
          ? trend.metadata.sampleContent
          : trend.topic,
      thumbnailUrl:
        typeof trend.metadata?.thumbnailUrl === 'string'
          ? trend.metadata.thumbnailUrl
          : undefined,
      title: trend.topic,
    }));
  }

  /**
   * Read the cached source-preview items stored on a trend's metadata.
   */
  getStoredTrendSourcePreview(
    trend: TrendEntity,
    limit: number = TREND_SOURCE_PREVIEW_LIMIT,
  ): TrendSourceItem[] {
    const cachedItems = trend.metadata?.sourcePreviewCache;
    if (!Array.isArray(cachedItems)) {
      return [];
    }

    return cachedItems
      .filter((item): item is TrendSourceItem => this.isTrendSourceItem(item))
      .slice(0, limit);
  }

  /**
   * Resolve the stored preview state, preferring the persisted state flag and
   * inferring from the items otherwise.
   */
  getStoredTrendSourcePreviewState(
    trend: TrendEntity,
    items: TrendSourceItem[],
  ): 'live' | 'fallback' | 'empty' {
    const storedState = trend.metadata?.sourcePreviewState;
    if (
      storedState === 'live' ||
      storedState === 'fallback' ||
      storedState === 'empty'
    ) {
      return storedState;
    }

    return this.getSourcePreviewState(items);
  }

  /**
   * Infer whether a set of source items represents live, fallback, or empty
   * data.
   */
  getSourcePreviewState(
    items: TrendSourceItem[],
  ): 'live' | 'fallback' | 'empty' {
    if (items.length === 0) {
      return 'empty';
    }

    return items[0]?.id.includes('-fallback') ? 'fallback' : 'live';
  }

  private normalizeSourceItems<TRaw>(
    items: TRaw[],
    map: (item: TRaw) => TrendSourceItem | null,
  ): TrendSourceItem[] {
    return items
      .map((item) => map(item))
      .filter((item): item is TrendSourceItem => item !== null);
  }

  private getTrendSearchTerm(trend: TrendEntity): string | null {
    const primaryHashtag = Array.isArray(trend.metadata?.hashtags)
      ? trend.metadata.hashtags.find((tag) => !!tag?.trim())
      : null;

    if (primaryHashtag) {
      return primaryHashtag.replace(/^#/, '').trim();
    }

    const topic = trend.topic?.trim();
    if (!topic) {
      return null;
    }

    return topic.replace(/^#/, '').trim();
  }

  private mapInstagramPostToSourceItem(
    post: ApifyInstagramPost,
  ): TrendSourceItem | null {
    const sourceUrl = post.shortCode
      ? `https://www.instagram.com/p/${post.shortCode}/`
      : post.videoUrl || post.imageUrl;

    if (!sourceUrl) {
      return null;
    }

    return {
      authorHandle: post.ownerUsername || undefined,
      contentType: post.videoUrl ? 'video' : 'image',
      id: post.id,
      mediaUrl: post.videoUrl || post.imageUrl,
      metrics: {
        comments: post.commentsCount,
        likes: post.likesCount,
        views: post.videoViewCount,
      },
      platform: 'instagram',
      publishedAt: post.timestamp || undefined,
      sourceUrl,
      text: post.caption,
      thumbnailUrl: post.imageUrl,
      title: this.truncateText(post.caption, 100),
    };
  }

  private mapTikTokVideoToSourceItem(
    video: ApifyTikTokVideo,
  ): TrendSourceItem | null {
    if (!video.webVideoUrl) {
      return null;
    }

    return {
      authorHandle:
        video.authorMeta?.name || video.authorMeta?.nickname || undefined,
      contentType: 'video',
      id: video.id,
      mediaUrl: video.webVideoUrl,
      metrics: {
        comments: video.commentCount,
        likes: video.diggCount,
        shares: video.shareCount,
        views: video.playCount,
      },
      platform: 'tiktok',
      publishedAt: video.createTime
        ? new Date(video.createTime * 1000).toISOString()
        : undefined,
      sourceUrl: video.webVideoUrl,
      text: video.desc,
      thumbnailUrl: video.authorMeta?.avatar || video.musicMeta?.coverUrl,
      title: this.truncateText(video.desc, 100),
    };
  }

  private mapTweetToSourceItem(tweet: ApifyNormalizedTweet): TrendSourceItem {
    const sourceUrl = tweet.authorUsername
      ? `https://x.com/${tweet.authorUsername}/status/${tweet.id}`
      : `https://x.com/i/web/status/${tweet.id}`;

    return {
      authorHandle: tweet.authorUsername || undefined,
      contentType: 'tweet',
      id: tweet.id,
      metrics: {
        comments: tweet.metrics?.replies,
        likes: tweet.metrics?.likes,
        shares: tweet.metrics?.retweets,
      },
      platform: 'twitter',
      publishedAt: tweet.createdAt?.toISOString(),
      sourceUrl,
      text: tweet.text,
      thumbnailUrl: tweet.authorAvatarUrl,
      title: this.truncateText(tweet.text, 100),
    };
  }

  private mapYouTubeVideoToSourceItem(
    video: ApifyYouTubeVideo,
  ): TrendSourceItem | null {
    if (!video.url) {
      return null;
    }

    return {
      authorHandle: video.channelName || undefined,
      contentType: 'video',
      id: video.id,
      mediaUrl: video.url,
      metrics: {
        comments: video.commentCount,
        likes: video.likeCount,
        views: video.viewCount,
      },
      platform: 'youtube',
      publishedAt: video.publishedAt || undefined,
      sourceUrl: video.url,
      text: video.description,
      thumbnailUrl: video.thumbnailUrl,
      title: video.title,
    };
  }

  private mapRedditPostToSourceItem(
    post: ApifyRedditPost,
  ): TrendSourceItem | null {
    const sourceUrl = post.permalink
      ? `https://reddit.com${post.permalink}`
      : post.url;

    if (!sourceUrl) {
      return null;
    }

    return {
      authorHandle: post.author || undefined,
      contentType: post.isVideo ? 'video' : 'post',
      id: post.id,
      mediaUrl: post.url,
      metrics: {
        comments: post.numComments,
        likes: post.score,
      },
      platform: 'reddit',
      publishedAt: post.createdUtc
        ? new Date(post.createdUtc * 1000).toISOString()
        : undefined,
      sourceUrl,
      text: post.title,
      title: post.title,
    };
  }

  private isTrendSourceItem(value: unknown): value is TrendSourceItem {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const item = value as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      typeof item.platform === 'string' &&
      typeof item.sourceUrl === 'string' &&
      typeof item.contentType === 'string'
    );
  }

  private truncateText(
    value?: string,
    maxLength: number = 100,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.length > maxLength
      ? `${value.slice(0, maxLength - 1)}…`
      : value;
  }
}
