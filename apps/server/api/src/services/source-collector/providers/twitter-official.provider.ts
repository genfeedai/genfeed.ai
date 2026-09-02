import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import type { SocialPostUrlReference } from '@genfeedai/contracts';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/**
 * Official X API provider. Tries brand OAuth2 user token first, then app bearer.
 * Implemented as two logical providers via {@link mode}.
 */
@Injectable()
export class TwitterBrandOAuthProvider implements SourceTimelineProvider {
  readonly name = 'brand-oauth' as const;
  readonly platforms = [SocialSourcePlatform.TWITTER] as const;

  constructor(private readonly twitterService: TwitterService) {}

  async canCollect(
    platform: SocialSourcePlatform,
    context: SourceCollectContext,
  ): Promise<boolean> {
    if (platform !== SocialSourcePlatform.TWITTER) {
      return false;
    }
    if (!context.organizationId || !context.brandId) {
      return false;
    }
    const token = await this.twitterService.resolveBrandUserAccessToken(
      context.organizationId,
      context.brandId,
      context.credentialId,
    );
    return Boolean(token);
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    if (!context.organizationId || !context.brandId) {
      throw new Error(
        'Brand OAuth provider requires organizationId and brandId',
      );
    }
    const accessToken = await this.twitterService.resolveBrandUserAccessToken(
      context.organizationId,
      context.brandId,
      context.credentialId,
    );
    if (!accessToken) {
      throw new Error('No brand X OAuth token available');
    }

    const posts = await this.twitterService.getUserTimelineByUsername(handle, {
      accessToken,
      excludeReplies: !context.includeReplies,
      excludeRetweets: !context.includeReposts,
      maxResults: context.limit ?? 25,
      sinceId: context.sinceId,
    });

    return {
      handle,
      platform,
      posts: posts.map(mapOfficialTweet),
      provider: 'brand-oauth',
    };
  }

  async collectPost(
    reference: SocialPostUrlReference,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    if (!context.organizationId || !context.brandId) {
      throw new Error(
        'Brand OAuth provider requires organizationId and brandId',
      );
    }
    const tweet = await this.twitterService.getTweetById(reference.postId, {
      brandId: context.brandId,
      credentialId: context.credentialId,
      organizationId: context.organizationId,
    });

    return {
      handle: tweet.authorUsername ?? reference.authorHandle ?? '',
      platform: SocialSourcePlatform.TWITTER,
      posts: [mapSingleTweet(tweet)],
      provider: 'brand-oauth',
    };
  }
}

@Injectable()
export class TwitterAppBearerProvider implements SourceTimelineProvider {
  readonly name = 'app-bearer' as const;
  readonly platforms = [SocialSourcePlatform.TWITTER] as const;

  constructor(private readonly twitterService: TwitterService) {}

  async canCollect(platform: SocialSourcePlatform): Promise<boolean> {
    return platform === SocialSourcePlatform.TWITTER;
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    const posts = await this.twitterService.getUserTimelineByUsername(handle, {
      excludeReplies: !context.includeReplies,
      excludeRetweets: !context.includeReposts,
      maxResults: context.limit ?? 25,
      sinceId: context.sinceId,
    });

    return {
      handle,
      platform,
      posts: posts.map(mapOfficialTweet),
      provider: 'app-bearer',
    };
  }

  async collectPost(
    reference: SocialPostUrlReference,
  ): Promise<SourceCollectResult> {
    const tweet = await this.twitterService.getTweetById(reference.postId);

    return {
      handle: tweet.authorUsername ?? reference.authorHandle ?? '',
      platform: SocialSourcePlatform.TWITTER,
      posts: [mapSingleTweet(tweet)],
      provider: 'app-bearer',
    };
  }
}

function mapSingleTweet(tweet: {
  authorId?: string;
  authorUsername?: string;
  createdAt?: string;
  id: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  text: string;
  url: string;
}): CollectedSourcePost {
  return {
    authorId: tweet.authorId,
    authorUsername: tweet.authorUsername,
    contentType: 'tweet',
    contentUrl: tweet.url,
    createdAt: tweet.createdAt ? new Date(tweet.createdAt) : undefined,
    id: tweet.id,
    metrics: {
      comments: tweet.replyCount,
      likes: tweet.likeCount,
      shares: tweet.retweetCount,
    },
    platform: SocialSourcePlatform.TWITTER,
    text: tweet.text,
  };
}

function mapOfficialTweet(tweet: {
  id: string;
  text: string;
  createdAt?: Date;
  authorId?: string;
  authorUsername?: string;
  authorName?: string;
  authorFollowersCount?: number;
  isRetweet: boolean;
  inReplyToId: string | null;
  metrics?: { likes: number; comments: number; shares: number };
}): CollectedSourcePost {
  return {
    authorDisplayName: tweet.authorName,
    authorFollowersCount: tweet.authorFollowersCount,
    authorId: tweet.authorId,
    authorUsername: tweet.authorUsername,
    contentType: 'tweet',
    contentUrl: tweet.authorUsername
      ? `https://x.com/${tweet.authorUsername}/status/${tweet.id}`
      : undefined,
    createdAt: tweet.createdAt,
    id: tweet.id,
    inReplyToId: tweet.inReplyToId,
    isRepost: tweet.isRetweet,
    metrics: tweet.metrics,
    platform: SocialSourcePlatform.TWITTER,
    text: tweet.text,
  };
}
