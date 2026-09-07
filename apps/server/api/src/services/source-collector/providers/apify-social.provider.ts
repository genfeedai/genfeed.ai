import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import type { SocialPostUrlReference } from '@genfeedai/contracts';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/** YouTube channel ids are `UC` followed by 22 URL-safe characters. */
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

/**
 * Build a YouTube channel URL for Apify's channel scraper from a bare
 * handle. A canonical channel id (`UC…`) resolves to `/channel/{id}`;
 * anything else is treated as an `@handle`.
 */
function toYoutubeChannelUrl(handle: string): string {
  return YOUTUBE_CHANNEL_ID_PATTERN.test(handle)
    ? `https://www.youtube.com/channel/${handle}`
    : `https://www.youtube.com/@${handle}`;
}

/**
 * Build a LinkedIn profile URL for Apify's profile scraper from a bare
 * handle. LinkedIn source handles already collapse `/in/`, `/company/` and
 * `/school/` prefixes (see `social-source-handle.util.ts`), so — matching
 * that util's own `buildProfileUrl` — this assumes a personal profile
 * (`/in/`); a company/school page handle is not distinguishable at this
 * point and would need the original prefix threaded through.
 */
function toLinkedinProfileUrl(handle: string): string {
  return `https://www.linkedin.com/in/${handle}`;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function readDate(value: unknown): Date | undefined {
  const raw = readString(value);
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Apify fallback for public timelines (X / IG / TikTok / YouTube / LinkedIn).
 * X, YouTube and LinkedIn throw when APIFY_API_TOKEN is missing (honest
 * failure).
 */
@Injectable()
export class ApifySocialProvider implements SourceTimelineProvider {
  readonly name = 'apify' as const;
  readonly platforms = [
    SocialSourcePlatform.TWITTER,
    SocialSourcePlatform.INSTAGRAM,
    SocialSourcePlatform.TIKTOK,
    SocialSourcePlatform.YOUTUBE,
    SocialSourcePlatform.LINKEDIN,
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

    if (platform === SocialSourcePlatform.YOUTUBE) {
      const videos = await this.apifyService.getYouTubeChannelUploads(
        toYoutubeChannelUrl(handle),
        { limit },
      );
      return {
        handle,
        platform,
        posts: videos
          .map((video): CollectedSourcePost | undefined => {
            const id = readString(video.id);
            if (!id) {
              return undefined;
            }
            const url =
              readString(video.url) ?? `https://www.youtube.com/watch?v=${id}`;
            return {
              authorId: readString(video.channelId),
              authorUsername: readString(video.channelName) || handle,
              contentType: 'video',
              contentUrl: url,
              createdAt: readDate(video.publishedAt) ?? new Date(),
              id,
              metrics: {
                comments: readCount(video.commentCount),
                likes: readCount(video.likeCount),
                views: readCount(video.viewCount),
              },
              platform: SocialSourcePlatform.YOUTUBE,
              text: readString(video.title) ?? '',
              thumbnailUrl: readString(video.thumbnailUrl),
            };
          })
          .filter((post): post is CollectedSourcePost => Boolean(post)),
        provider: 'apify',
      };
    }

    if (platform === SocialSourcePlatform.LINKEDIN) {
      const posts = await this.apifyService.getLinkedInProfilePosts(
        toLinkedinProfileUrl(handle),
        { limit },
      );
      return {
        handle,
        platform,
        posts: posts
          .map((post): CollectedSourcePost | undefined => {
            const id = readString(post.id) ?? readString(post.urn);
            if (!id) {
              return undefined;
            }
            const imageUrl =
              readString(post.imageUrl) ?? readString(post.images?.[0]);
            const videoUrl = readString(post.videoUrl);
            return {
              authorDisplayName:
                readString(post.authorName) ?? readString(post.authorFullName),
              authorUsername: handle,
              contentType: videoUrl ? 'video' : 'post',
              contentUrl:
                readString(post.postUrl) ??
                readString(post.url) ??
                readString(post.authorUrl),
              createdAt:
                readDate(post.postedAt) ??
                readDate(post.date) ??
                readDate(post.publishedAt) ??
                new Date(),
              id,
              mediaUrls: [videoUrl, imageUrl].filter((value): value is string =>
                Boolean(value),
              ),
              metrics: {
                comments: readCount(post.commentsCount ?? post.numComments),
                likes: readCount(post.likesCount ?? post.numLikes),
                shares: readCount(post.sharesCount ?? post.numShares),
              },
              platform: SocialSourcePlatform.LINKEDIN,
              text: readString(post.text) ?? readString(post.commentary) ?? '',
              thumbnailUrl: imageUrl,
            };
          })
          .filter((post): post is CollectedSourcePost => Boolean(post)),
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
