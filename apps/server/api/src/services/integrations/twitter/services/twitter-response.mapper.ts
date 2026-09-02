import { CredentialPlatform } from '@genfeedai/enums';
import type { ITwitterSearchResult } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export interface TwitterTrendItem {
  name: string;
  tweet_volume: number | null;
  url: string;
}

export interface TwitterTrendResponse {
  trends?: TwitterTrendItem[];
}

export interface TwitterTrendResult {
  brandId?: string;
  growthRate: number;
  mentions: number;
  organizationId?: string;
  platform: CredentialPlatform;
  topic: string;
  url: string;
}

export interface TwitterUserSummary {
  id: string;
  username: string;
  name?: string;
  public_metrics?: {
    followers_count?: number;
  };
}

export interface TwitterUserResponse {
  data?: TwitterUserSummary;
}

export interface TwitterUsersResponse {
  data?: TwitterUserSummary[];
}

export interface TwitterMappedUser {
  followersCount?: number;
  id: string;
  name?: string;
  username: string;
}

interface TwitterSearchAuthor {
  id: string;
  name: string;
  username: string;
}

interface TwitterSearchTweet {
  author_id?: string;
  created_at?: string;
  id: string;
  public_metrics?: {
    like_count?: number;
    quote_count?: number;
    reply_count?: number;
    retweet_count?: number;
  };
  text: string;
}

export interface TwitterSearchResponse {
  data?: {
    data?: TwitterSearchTweet[];
  };
  includes?: {
    users?: TwitterSearchAuthor[];
  };
}

interface TwitterMetrics {
  bookmark_count?: number;
  impression_count?: number;
  like_count?: number;
  quote_count?: number;
  reply_count?: number;
  retweet_count?: number;
  view_count?: number;
}

export interface TwitterMediaItem {
  media_key?: string;
  public_metrics?: {
    view_count?: number;
  };
  type: string;
}

interface TwitterAnalyticsTweet {
  attachments?: {
    media_keys?: string[];
  };
  id?: string;
  non_public_metrics?: TwitterMetrics;
  organic_metrics?: TwitterMetrics;
  public_metrics?: TwitterMetrics;
}

export interface TwitterAnalyticsResponse {
  data?: TwitterAnalyticsTweet[];
  includes?: {
    media?: TwitterMediaItem[];
  };
}

export interface TwitterAnalyticsResult {
  bookmarks?: number;
  comments: number;
  engagementRate?: number;
  impressions?: number;
  likes: number;
  mediaType?: 'text' | 'image' | 'video' | 'mixed';
  quotes?: number;
  retweets?: number;
  views: number;
}

@Injectable()
export class TwitterResponseMapper {
  mapSearchResults(result: TwitterSearchResponse): ITwitterSearchResult[] {
    const authors = new Map(
      (result.includes?.users ?? []).map((user) => [
        user.id,
        { name: user.name, username: user.username },
      ]),
    );

    return (result.data?.data ?? [])
      .map((tweet) => {
        const author = authors.get(tweet.author_id ?? '');
        const metrics = tweet.public_metrics ?? {};
        const likes = metrics.like_count ?? 0;
        const retweets = metrics.retweet_count ?? 0;

        return {
          authorName: author?.name ?? 'Unknown',
          authorUsername: author?.username ?? 'unknown',
          createdAt: tweet.created_at ?? new Date().toISOString(),
          engagement: likes + retweets,
          id: tweet.id,
          likes,
          quotes: metrics.quote_count ?? 0,
          replies: metrics.reply_count ?? 0,
          retweets,
          text: tweet.text,
        };
      })
      .sort((left, right) => right.engagement - left.engagement);
  }

  mapUser(result: TwitterUserResponse): TwitterMappedUser | null {
    return result.data ? this.mapUserSummary(result.data) : null;
  }

  mapUsers(result: TwitterUsersResponse): TwitterMappedUser[] {
    return (result.data ?? []).map((user) => this.mapUserSummary(user));
  }

  mapTrends(
    result: TwitterTrendResponse[] | null | undefined,
    organizationId?: string,
    brandId?: string,
  ): TwitterTrendResult[] {
    return (result?.[0]?.trends ?? []).slice(0, 10).map((trend) => {
      const mentions = trend.tweet_volume || 0;

      return {
        brandId,
        growthRate: this.calculateGrowthRate(mentions),
        mentions,
        organizationId,
        platform: CredentialPlatform.TWITTER,
        topic: trend.name,
        url: trend.url,
      };
    });
  }

  mapAnalytics(result: TwitterAnalyticsResponse): TwitterAnalyticsResult {
    return this.mapTweetAnalytics(
      result.data?.[0],
      result.includes?.media ?? [],
    );
  }

  mapAnalyticsBatch(
    result: TwitterAnalyticsResponse,
  ): Map<string, TwitterAnalyticsResult> {
    const mediaByKey = new Map<string, TwitterMediaItem>();
    for (const media of result.includes?.media ?? []) {
      if (media.media_key) {
        mediaByKey.set(media.media_key, media);
      }
    }

    const analyticsByTweet = new Map<string, TwitterAnalyticsResult>();
    for (const tweet of result.data ?? []) {
      if (!tweet.id) {
        continue;
      }

      const media = (tweet.attachments?.media_keys ?? []).flatMap((key) => {
        const item = mediaByKey.get(key);
        return item ? [item] : [];
      });

      analyticsByTweet.set(tweet.id, this.mapTweetAnalytics(tweet, media));
    }

    return analyticsByTweet;
  }

  private calculateGrowthRate(tweetVolume: number): number {
    if (tweetVolume === 0) {
      return 0;
    }

    return Math.round(Math.min((tweetVolume / 1_000_000) * 100, 100));
  }

  private mapTweetAnalytics(
    tweet: TwitterAnalyticsTweet | undefined,
    media: TwitterMediaItem[],
  ): TwitterAnalyticsResult {
    const metrics = tweet?.public_metrics ?? {};
    const nonPublicMetrics = tweet?.non_public_metrics ?? {};
    const organicMetrics = tweet?.organic_metrics ?? {};
    const mediaType = this.resolveMediaType(media);
    const impressions =
      nonPublicMetrics.impression_count || organicMetrics.impression_count || 0;
    const totalEngagements =
      (metrics.like_count || 0) +
      (metrics.retweet_count || 0) +
      (metrics.reply_count || 0) +
      (metrics.quote_count || 0);
    const engagementRate =
      impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

    let views = metrics.view_count || 0;
    if (mediaType === 'video') {
      const video = media.find((item) => item.type === 'video');
      if (video?.public_metrics?.view_count) {
        views = video.public_metrics.view_count;
      }
    }

    return {
      bookmarks: metrics.bookmark_count || 0,
      comments: metrics.reply_count || 0,
      engagementRate:
        engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
      impressions: impressions || undefined,
      likes: metrics.like_count || 0,
      mediaType,
      quotes: metrics.quote_count || 0,
      retweets: metrics.retweet_count || 0,
      views: views || impressions || 0,
    };
  }

  private mapUserSummary(user: TwitterUserSummary): TwitterMappedUser {
    return {
      followersCount: user.public_metrics?.followers_count,
      id: user.id,
      name: user.name,
      username: user.username,
    };
  }

  private resolveMediaType(
    media: TwitterMediaItem[],
  ): TwitterAnalyticsResult['mediaType'] {
    if (media.length === 0) {
      return 'text';
    }

    const mediaTypes = new Set(media.map((item) => item.type));
    if (mediaTypes.size > 1) {
      return 'mixed';
    }
    if (mediaTypes.has('video') || mediaTypes.has('animated_gif')) {
      return 'video';
    }
    if (mediaTypes.has('photo')) {
      return 'image';
    }

    return 'text';
  }
}
