import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import type { SocialPostUrlReference } from '@genfeedai/enums';
import { SocialSourcePlatform } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

/**
 * Apify fallback for public timelines (X / IG / TikTok).
 * X throws when APIFY_API_TOKEN is missing (honest failure).
 */
@Injectable()
export class ApifySocialProvider implements SourceTimelineProvider {
  readonly name = 'apify' as const;
  readonly platforms = [
    SocialSourcePlatform.TWITTER,
    SocialSourcePlatform.INSTAGRAM,
    SocialSourcePlatform.TIKTOK,
  ] as const;

  constructor(private readonly apifyService: ApifyService) {}

  async canCollect(platform: SocialSourcePlatform): Promise<boolean> {
    return this.platforms.includes(platform as (typeof this.platforms)[number]);
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    const limit = context.limit ?? 25;
    const includeReplies = Boolean(context.includeReplies);
    const includeReposts = Boolean(context.includeReposts);

    if (platform === SocialSourcePlatform.TWITTER) {
      const tweets = await this.apifyService.getTwitterUserTimeline(handle, {
        limit,
        sinceId: context.sinceId,
      });
      const filtered = tweets.filter((tweet) => {
        if (!includeReposts && tweet.isRetweet) {
          return false;
        }
        if (!includeReplies && tweet.inReplyToTweetId) {
          return false;
        }
        return true;
      });
      return {
        handle,
        platform,
        posts: filtered.map(
          (tweet): CollectedSourcePost => ({
            authorAvatarUrl: tweet.authorAvatarUrl,
            authorDisplayName: tweet.authorDisplayName,
            authorFollowersCount: tweet.authorFollowersCount,
            authorId: tweet.authorId,
            authorUsername: tweet.authorUsername,
            contentType: 'tweet',
            contentUrl: tweet.authorUsername
              ? `https://x.com/${tweet.authorUsername}/status/${tweet.id}`
              : undefined,
            createdAt: tweet.createdAt,
            hashtags: tweet.hashtags,
            id: tweet.id,
            inReplyToId: tweet.inReplyToTweetId ?? null,
            isRepost: tweet.isRetweet,
            metrics: tweet.metrics
              ? {
                  comments: tweet.metrics.replies,
                  likes: tweet.metrics.likes,
                  shares: tweet.metrics.retweets,
                }
              : undefined,
            platform: SocialSourcePlatform.TWITTER,
            text: tweet.text,
          }),
        ),
        provider: 'apify',
      };
    }

    if (platform === SocialSourcePlatform.INSTAGRAM) {
      const posts = await this.apifyService.getInstagramUserPosts(handle, {
        limit,
      });
      return {
        handle,
        platform,
        posts: posts.map(
          (post): CollectedSourcePost => ({
            authorUsername: post.ownerUsername || handle,
            contentType: post.videoUrl ? 'reel' : 'post',
            contentUrl: post.shortCode
              ? `https://www.instagram.com/p/${post.shortCode}/`
              : undefined,
            createdAt: post.timestamp ? new Date(post.timestamp) : new Date(),
            id: post.id,
            mediaUrls: [post.videoUrl, post.imageUrl].filter(
              (url): url is string => Boolean(url),
            ),
            metrics: {
              comments: post.commentsCount,
              likes: post.likesCount,
              views: post.videoViewCount,
            },
            platform: SocialSourcePlatform.INSTAGRAM,
            text: post.caption ?? '',
            thumbnailUrl: post.imageUrl,
          }),
        ),
        provider: 'apify',
      };
    }

    if (platform === SocialSourcePlatform.TIKTOK) {
      const videos = await this.apifyService.getTikTokUserVideos(handle, {
        limit,
      });
      return {
        handle,
        platform,
        posts: videos.map(
          (video): CollectedSourcePost => ({
            authorUsername: video.authorMeta?.name || handle,
            contentType: 'video',
            contentUrl: video.webVideoUrl,
            createdAt: video.createTime
              ? new Date(video.createTime * 1000)
              : new Date(),
            id: video.id,
            mediaUrls: video.webVideoUrl ? [video.webVideoUrl] : [],
            metrics: {
              comments: video.commentCount,
              likes: video.diggCount,
              shares: video.shareCount,
              views: video.playCount,
            },
            platform: SocialSourcePlatform.TIKTOK,
            text: video.text ?? '',
            thumbnailUrl: video.musicMeta?.coverUrl,
          }),
        ),
        provider: 'apify',
      };
    }

    throw new Error(`Apify provider does not support platform: ${platform}`);
  }

  async collectPost(
    reference: SocialPostUrlReference,
  ): Promise<SourceCollectResult> {
    if (reference.platform === SocialSourcePlatform.TWITTER) {
      const tweet = await this.apifyService.getTweetByUrl(
        reference.url,
        reference.postId,
      );
      return {
        handle: tweet.authorUsername || (reference.authorHandle ?? ''),
        platform: reference.platform,
        posts: [
          {
            authorAvatarUrl: tweet.authorAvatarUrl,
            authorDisplayName: tweet.authorDisplayName,
            authorFollowersCount: tweet.authorFollowersCount,
            authorId: tweet.authorId,
            authorUsername: tweet.authorUsername,
            contentType: 'tweet',
            contentUrl: reference.url,
            createdAt: tweet.createdAt,
            hashtags: tweet.hashtags,
            id: tweet.id,
            inReplyToId: tweet.inReplyToTweetId ?? null,
            isRepost: tweet.isRetweet,
            metrics: tweet.metrics
              ? {
                  comments: tweet.metrics.replies,
                  likes: tweet.metrics.likes,
                  shares: tweet.metrics.retweets,
                }
              : undefined,
            platform: SocialSourcePlatform.TWITTER,
            text: tweet.text,
          },
        ],
        provider: 'apify',
      };
    }

    if (reference.platform === SocialSourcePlatform.INSTAGRAM) {
      const post = await this.apifyService.getInstagramPostByUrl(reference.url);
      return {
        handle: post.ownerUsername || (reference.authorHandle ?? ''),
        platform: reference.platform,
        posts: [
          {
            authorUsername: post.ownerUsername || reference.authorHandle || '',
            contentType: post.videoUrl ? 'reel' : 'post',
            contentUrl: post.shortCode
              ? `https://www.instagram.com/p/${post.shortCode}/`
              : reference.url,
            createdAt: post.timestamp ? new Date(post.timestamp) : new Date(),
            id: post.id,
            mediaUrls: [post.videoUrl, post.imageUrl].filter(
              (url): url is string => Boolean(url),
            ),
            metrics: {
              comments: post.commentsCount,
              likes: post.likesCount,
              views: post.videoViewCount,
            },
            platform: SocialSourcePlatform.INSTAGRAM,
            text: post.caption ?? '',
            thumbnailUrl: post.imageUrl,
          },
        ],
        provider: 'apify',
      };
    }

    if (reference.platform === SocialSourcePlatform.TIKTOK) {
      const video = await this.apifyService.getTikTokVideoByUrl(reference.url);
      return {
        handle: video.authorMeta?.name || (reference.authorHandle ?? ''),
        platform: reference.platform,
        posts: [
          {
            authorUsername:
              video.authorMeta?.name || reference.authorHandle || '',
            contentType: 'video',
            contentUrl: video.webVideoUrl || reference.url,
            createdAt: video.createTime
              ? new Date(video.createTime * 1000)
              : new Date(),
            id: video.id,
            mediaUrls: video.webVideoUrl ? [video.webVideoUrl] : [],
            metrics: {
              comments: video.commentCount,
              likes: video.diggCount,
              shares: video.shareCount,
              views: video.playCount,
            },
            platform: SocialSourcePlatform.TIKTOK,
            text: video.text ?? '',
            thumbnailUrl: video.musicMeta?.coverUrl,
          },
        ],
        provider: 'apify',
      };
    }

    throw new Error(
      `Apify provider does not support platform: ${reference.platform}`,
    );
  }
}
