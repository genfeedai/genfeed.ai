import type {
  ApifyInstagramComment,
  ApifyInstagramPost,
  ApifyNormalizedInstagramComment,
  ApifyTrendData,
  ApifyVideoData,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import type { SocialSourceResearchContext } from '@api/services/source-collector/source-collector.types';
import { Injectable } from '@nestjs/common';

/**
 * ApifyInstagramService
 *
 * Handles all Instagram-related Apify scraping operations:
 * trends, videos, comments, user posts, and hashtag search.
 */
@Injectable()
export class ApifyInstagramService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly TREND_SEED_HASHTAGS = [
    'viral',
    'reels',
    'trending',
    'explorepage',
  ] as const;

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly runner: ResearchCollectionRunner,
  ) {}

  /**
   * Get Instagram trending hashtags.
   *
   * The hashtag scraper returns posts, not hashtag summaries, so the trends
   * are the hashtags those posts carry, ranked by how many posts use them.
   */
  async getInstagramTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    try {
      const requestedLimit = Math.max(1, options?.limit || 5);
      const seedCount = this.getTrendSeedCount(requestedLimit);
      const seedHashtags = this.TREND_SEED_HASHTAGS.slice(0, seedCount);

      const input = {
        hashtags: seedHashtags,
        // Apify treats this as a per-hashtag limit, so distribute the
        // caller's requested total budget across the few highest-signal seeds.
        resultsLimit: Math.max(
          1,
          Math.ceil(requestedLimit / seedHashtags.length),
        ),
      };

      const rawPosts = await this.baseService.runActor<ApifyInstagramPost>(
        this.baseService.ACTORS.INSTAGRAM_HASHTAG,
        input,
      );

      return this.normalizeInstagramTrends(rawPosts).slice(0, requestedLimit);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramTrends failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get Instagram trending posts/reels
   */
  async getInstagramVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    try {
      const input = {
        hashtags: ['reels', 'viral', 'trending'],
        resultsLimit: limit,
        resultsType: 'posts',
      };

      const rawPosts = await this.baseService.runActor<ApifyInstagramPost>(
        this.baseService.ACTORS.INSTAGRAM_SCRAPER,
        input,
      );

      return this.normalizeInstagramVideos(rawPosts);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramVideos failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get comments on an Instagram post
   * Used to find comments to reply to
   */
  async getInstagramPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedInstagramComment[]> {
    try {
      const input = {
        directUrls: [postUrl],
        resultsLimit: options?.limit || 50,
      };

      const rawComments =
        await this.baseService.runActor<ApifyInstagramComment>(
          this.baseService.ACTORS.INSTAGRAM_COMMENT_SCRAPER,
          input,
        );

      return this.normalizeInstagramComments(rawComments);
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramPostComments failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get recent posts from an Instagram user
   * Used to monitor accounts
   */
  async getInstagramUserPosts(
    username: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyInstagramPost[]> {
    // Hard-fail when Apify is not configured so Following sync cannot look
    // "successful" with zero posts after a silent skip.
    const token = researchContext ? undefined : this.baseService.getApiToken();
    if (!researchContext && !token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured — cannot scrape Instagram timelines',
      );
    }

    try {
      const input = {
        resultsLimit: options?.limit || 20,
        usernames: [username],
      };

      const rawPosts = await (researchContext
        ? this.runner.run<ApifyInstagramPost>(
            researchContext.organizationId,
            this.baseService.ACTORS.INSTAGRAM_SCRAPER,
            input,
            { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
          )
        : this.baseService.runActor<ApifyInstagramPost>(
            this.baseService.ACTORS.INSTAGRAM_SCRAPER,
            input,
          ));

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getInstagramUserPosts failed for @${username}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch one Instagram post/reel by its canonical URL (single-post import).
   * Hard-fails without a token or when the post cannot be resolved so the
   * import flow never reports an empty success.
   */
  async getInstagramPostByUrl(
    postUrl: string,
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyInstagramPost> {
    const token = researchContext ? undefined : this.baseService.getApiToken();
    if (!researchContext && !token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured — cannot scrape Instagram posts',
      );
    }

    const input = {
      directUrls: [postUrl],
      resultsLimit: 1,
      resultsType: 'posts',
    };

    const rawPosts = await (researchContext
      ? this.runner.run<ApifyInstagramPost>(
          researchContext.organizationId,
          this.baseService.ACTORS.INSTAGRAM_SCRAPER,
          input,
          { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
        )
      : this.baseService.runActor<ApifyInstagramPost>(
          this.baseService.ACTORS.INSTAGRAM_SCRAPER,
          input,
        ));

    const post = rawPosts[0];
    if (!post?.id) {
      throw new Error(
        'Instagram post not found via Apify — it may be deleted or private',
      );
    }
    return post;
  }

  /**
   * Search Instagram posts by hashtag
   */
  async searchInstagramByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyInstagramPost[]> {
    try {
      const input = {
        hashtags: [hashtag.replace(/^#/, '')],
        resultsLimit: options?.limit || 50,
      };

      const rawPosts = await this.baseService.runActor<ApifyInstagramPost>(
        this.baseService.ACTORS.INSTAGRAM_HASHTAG,
        input,
      );

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.searchInstagramByHashtag failed for #${hashtag}`,
        error,
      );
      return [];
    }
  }

  private normalizeInstagramTrends(
    posts: ApifyInstagramPost[],
  ): ApifyTrendData[] {
    const hashtagStats = new Map<
      string,
      {
        engagement: number;
        postCount: number;
        sampleContent?: string;
        urls: string[];
        views: number;
      }
    >();

    for (const post of posts) {
      const hashtags = new Set(
        (post.hashtags ?? [])
          .map((hashtag) => hashtag.replace(/^#/, '').trim().toLowerCase())
          .filter(Boolean),
      );

      // A post without hashtags carries no hashtag trend.
      for (const hashtag of hashtags) {
        const stats = hashtagStats.get(hashtag) ?? {
          engagement: 0,
          postCount: 0,
          urls: [],
          views: 0,
        };
        stats.engagement += (post.likesCount || 0) + (post.commentsCount || 0);
        stats.postCount += 1;
        stats.sampleContent ??= post.caption?.substring(0, 280);
        stats.views += post.videoViewCount || 0;
        if (post.url) {
          stats.urls.push(post.url);
        }
        hashtagStats.set(hashtag, stats);
      }
    }

    return Array.from(hashtagStats)
      .sort(
        ([, left], [, right]) =>
          right.postCount - left.postCount ||
          right.engagement - left.engagement,
      )
      .map(([hashtag, stats]) => ({
        growthRate: this.baseService.calculateGrowthRate(stats.engagement),
        mentions: stats.postCount,
        metadata: {
          engagement: stats.engagement,
          hashtags: [hashtag],
          postCount: stats.postCount,
          sampleContent: stats.sampleContent,
          source: 'apify' as const,
          trendType: 'hashtag' as const,
          urls: stats.urls,
        },
        platform: 'instagram',
        topic: hashtag,
        viralityScore: this.baseService.calculateViralityScore(
          stats.views,
          stats.engagement,
        ),
      }));
  }

  private normalizeInstagramVideos(
    posts: ApifyInstagramPost[],
  ): ApifyVideoData[] {
    return posts
      .filter((post) => post.videoUrl || post.videoViewCount)
      .map((post) => {
        const viewCount = post.videoViewCount || 0;
        const likeCount = post.likesCount || 0;
        const commentCount = post.commentsCount || 0;
        const publishedAt = post.timestamp
          ? new Date(post.timestamp)
          : undefined;

        const metrics = this.baseService.calculateEngagementMetrics(
          viewCount,
          likeCount,
          commentCount,
          0, // Instagram doesn't expose shares
          publishedAt,
        );

        return {
          commentCount,
          creatorHandle: post.ownerUsername || 'unknown',
          description: post.caption,
          engagementRate: metrics.engagementRate,
          externalId: post.id,
          hashtags: post.hashtags || [],
          likeCount,
          platform: 'instagram',
          publishedAt,
          shareCount: 0,
          thumbnailUrl: post.imageUrl,
          title: post.caption?.substring(0, 100),
          velocity: metrics.velocity,
          videoUrl: post.url || post.videoUrl,
          playUrl: post.videoUrl,
          viewCount,
          viralScore: metrics.viralScore,
        };
      });
  }

  private normalizeInstagramComments(
    comments: ApifyInstagramComment[],
  ): ApifyNormalizedInstagramComment[] {
    return comments.map((comment) => ({
      authorAvatarUrl: comment.ownerProfilePicUrl,
      authorId: comment.ownerId || '',
      authorUsername: comment.ownerUsername || '',
      createdAt: comment.timestamp ? new Date(comment.timestamp) : new Date(),
      id: comment.id,
      metrics: {
        likes: comment.likesCount || 0,
        replies: comment.repliesCount || 0,
      },
      postId: comment.postId || '',
      postShortCode: comment.postShortCode,
      text: comment.text,
    }));
  }

  private getTrendSeedCount(limit: number): number {
    if (limit <= 6) {
      return 2;
    }

    if (limit <= 12) {
      return 3;
    }

    return this.TREND_SEED_HASHTAGS.length;
  }
}
