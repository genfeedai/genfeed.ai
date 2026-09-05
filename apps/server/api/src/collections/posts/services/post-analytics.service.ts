import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';
import { PostAnalyticsEntity } from '@api/collections/posts/entities/post-analytics.entity';
import { type PostDocument } from '@api/collections/posts/post.schema';
import type { PostAnalyticsDocument } from '@api/collections/posts/schemas/post-analytics.schema';
import {
  mapTikTokPostMetrics,
  mapYouTubePostMetrics,
  type TikTokPostMetrics,
  type UpdateTodayAnalyticsMetrics,
  type YouTubePostMetrics,
} from '@api/collections/posts/services/post-analytics-platform-metrics';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { CredentialPlatform, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const CREDENTIAL_PLATFORM = {
  FACEBOOK: 'FACEBOOK' as CredentialPlatform,
  INSTAGRAM: 'INSTAGRAM' as CredentialPlatform,
  LINKEDIN: 'LINKEDIN' as CredentialPlatform,
  MASTODON: 'MASTODON' as CredentialPlatform,
  PINTEREST: 'PINTEREST' as CredentialPlatform,
  THREADS: 'THREADS' as CredentialPlatform,
  TIKTOK: 'TIKTOK' as CredentialPlatform,
  TWITTER: 'TWITTER' as CredentialPlatform,
  YOUTUBE: 'YOUTUBE' as CredentialPlatform,
};

@Injectable()
export class PostAnalyticsService extends BaseService<
  PostAnalyticsDocument,
  CreatePostAnalyticsDto,
  Partial<CreatePostAnalyticsDto>
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,

    private readonly postsService: PostsService,
  ) {
    super(prisma, 'postAnalytics', logger);
  }

  async updateTodayAnalytics(
    postId: string,
    platform: CredentialPlatform,
    metrics: UpdateTodayAnalyticsMetrics,
  ): Promise<PostAnalyticsEntity | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find yesterday's analytics to calculate increments
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayAnalytics = await this.prisma.postAnalytics.findFirst({
      where: { date: yesterday, platform, postId },
    });

    const yDoc = yesterdayAnalytics as unknown as Record<string, number> | null;

    const increments = {
      totalCommentsIncrement:
        metrics.totalComments - (yDoc?.totalComments || 0),
      totalLikesIncrement: metrics.totalLikes - (yDoc?.totalLikes || 0),
      totalSavesIncrement: (metrics.totalSaves || 0) - (yDoc?.totalSaves || 0),
      totalSharesIncrement:
        (metrics.totalShares || 0) - (yDoc?.totalShares || 0),
      totalViewsIncrement: metrics.totalViews - (yDoc?.totalViews || 0),
    };

    // Calculate engagement rate
    const engagementRate =
      metrics.totalViews > 0
        ? ((metrics.totalLikes +
            metrics.totalComments +
            (metrics.totalShares || 0)) /
            metrics.totalViews) *
          100
        : 0;

    // Fetch post to get required fields for upsert
    const post = await this.postsService.findOne({ id: postId });
    if (!post) {
      this.logger.error(`Post ${postId} not found for analytics update`);
      return null;
    }

    // Analytics ownership always comes from canonical scalar foreign keys.
    const owner = this.resolvePostOwner(post);
    if (!owner) {
      return null;
    }

    const result = await this.prisma.postAnalytics.upsert({
      create: {
        brandId: owner.brandId,
        date: today,
        engagementRate,
        organizationId: owner.organizationId,
        platform,
        postId,
        userId: owner.userId,
        ...metrics,
        ...increments,
      } as Prisma.PostAnalyticsUncheckedCreateInput,
      update: {
        engagementRate,
        ...metrics,
        ...increments,
      } as Prisma.PostAnalyticsUpdateInput,
      where: {
        postId_platform_date: { date: today, platform, postId },
      },
    });

    return result
      ? new PostAnalyticsEntity(result as PostAnalyticsDocument)
      : null;
  }

  async getPostAnalyticsSummary(postId: string): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    avgEngagementRate: number;
    platforms: Record<
      string,
      {
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
        engagementRate: number;
      }
    >;
  }> {
    const allDocs = await this.prisma.postAnalytics.findMany({
      where: { postId },
    });

    const docs = allDocs as unknown as Array<{
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group in memory
    const platformMap = new Map<
      string,
      {
        engagementRates: number[];
        comments: number;
        likes: number;
        saves: number;
        shares: number;
        views: number;
      }
    >();

    for (const doc of docs) {
      const existing = platformMap.get(doc.platform);
      if (existing) {
        // Take max values for totals
        existing.views = Math.max(existing.views, doc.totalViews);
        existing.likes = Math.max(existing.likes, doc.totalLikes);
        existing.comments = Math.max(existing.comments, doc.totalComments);
        existing.shares = Math.max(existing.shares, doc.totalShares);
        existing.saves = Math.max(existing.saves, doc.totalSaves);
        existing.engagementRates.push(doc.engagementRate);
      } else {
        platformMap.set(doc.platform, {
          comments: doc.totalComments,
          engagementRates: [doc.engagementRate],
          likes: doc.totalLikes,
          saves: doc.totalSaves,
          shares: doc.totalShares,
          views: doc.totalViews,
        });
      }
    }

    const platforms: Record<
      string,
      {
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
        engagementRate: number;
      }
    > = {};

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSaves = 0;
    let totalEngagement = 0;

    for (const [platform, data] of platformMap.entries()) {
      const avgEngagementRate =
        data.engagementRates.length > 0
          ? data.engagementRates.reduce((a, b) => a + b, 0) /
            data.engagementRates.length
          : 0;

      platforms[platform] = {
        engagementRate: avgEngagementRate,
        totalComments: data.comments,
        totalLikes: data.likes,
        totalSaves: data.saves,
        totalShares: data.shares,
        totalViews: data.views,
      };

      totalViews += data.views;
      totalLikes += data.likes;
      totalComments += data.comments;
      totalShares += data.shares;
      totalSaves += data.saves;
      totalEngagement += avgEngagementRate;
    }

    const platformCount = platformMap.size;

    return {
      avgEngagementRate:
        platformCount > 0 ? totalEngagement / platformCount : 0,
      platforms,
      totalComments,
      totalLikes,
      totalSaves,
      totalShares,
      totalViews,
    };
  }

  async getAnalyticsByDateRange(
    postId: string,
    startDate: Date,
    endDate: Date,
    platform?: string,
  ): Promise<PostAnalyticsEntity[]> {
    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      postId,
    };

    if (platform) {
      where.platform = platform;
    }

    const results = await this.prisma.postAnalytics.findMany({
      orderBy: { date: 'asc' },
      where: where as Prisma.PostAnalyticsWhereInput,
    });

    return results.map(
      (doc) => new PostAnalyticsEntity(doc as PostAnalyticsDocument),
    );
  }

  private resolvePostOwner(post: PostDocument): {
    brandId: string;
    organizationId: string;
    userId: string;
  } | null {
    const { brandId, organizationId, userId } = post;

    if (!brandId || !organizationId || !userId) {
      this.logger.error(
        `Post ${post.id ?? 'unknown'} is missing resolvable owner ids for analytics`,
        {
          hasBrandId: Boolean(brandId),
          hasOrganizationId: Boolean(organizationId),
          hasUserId: Boolean(userId),
        },
      );
      return null;
    }

    return { brandId, organizationId, userId };
  }

  async processTwitterAnalytics(
    postId: string,
    analytics: {
      views: number;
      likes: number;
      comments: number;
      retweets?: number;
      bookmarks?: number;
      quotes?: number;
      impressions?: number;
      engagementRate?: number;
      mediaType?: 'text' | 'image' | 'video' | 'mixed';
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.TWITTER, {
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.retweets || 0,
        totalViews: analytics.impressions || analytics.views,
      });

      this.logger.log(`Updated Twitter analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Twitter analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process YouTube analytics from batch fetch and update post analytics
   */
  async processYouTubeAnalytics(
    postId: string,
    analytics: YouTubePostMetrics,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.YOUTUBE,
        mapYouTubePostMetrics(analytics),
      );

      this.logger.log(`Updated YouTube analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process YouTube analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Instagram analytics and update post analytics
   */
  async processInstagramAnalytics(
    postId: string,
    analytics: {
      views?: number;
      likes: number;
      comments: number;
      shares?: number;
      saves?: number;
      impressions?: number;
      reach?: number;
      engagementRate?: number;
      mediaType?: 'image' | 'video' | 'carousel' | 'reel' | 'story';
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.INSTAGRAM, {
        impressions: analytics.impressions ?? null,
        metricAvailability: {
          impressions:
            analytics.impressions == null ? 'unavailable' : 'observed',
          reach: analytics.reach == null ? 'unavailable' : 'observed',
          views: analytics.views == null ? 'unavailable' : 'observed',
        },
        reach: analytics.reach ?? null,
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalSaves: analytics.saves || 0,
        totalShares: analytics.shares || 0,
        totalViews:
          analytics.views || analytics.impressions || analytics.reach || 0,
        videoViews: analytics.views ?? null,
      });

      this.logger.log(`Updated Instagram analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Instagram analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process TikTok analytics and update post analytics
   */
  async processTikTokAnalytics(
    postId: string,
    analytics: TikTokPostMetrics,
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(
        postId,
        CREDENTIAL_PLATFORM.TIKTOK,
        mapTikTokPostMetrics(analytics),
      );

      this.logger.log(`Updated TikTok analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process TikTok analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Pinterest analytics and update post analytics
   */
  async processPinterestAnalytics(
    postId: string,
    analytics: {
      views?: number;
      impressions?: number;
      likes: number;
      comments: number;
      saves?: number;
      clicks?: number;
      engagementRate?: number;
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.PINTEREST, {
        clicks: analytics.clicks ?? null,
        impressions: analytics.impressions ?? null,
        metricAvailability: {
          clicks: analytics.clicks == null ? 'unavailable' : 'observed',
          impressions:
            analytics.impressions == null ? 'unavailable' : 'observed',
          views: analytics.views == null ? 'unavailable' : 'observed',
        },
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalSaves: analytics.saves || 0,
        totalShares: 0,
        totalViews: analytics.views || analytics.impressions || 0,
      });

      this.logger.log(`Updated Pinterest analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Pinterest analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process LinkedIn analytics and update post analytics
   */
  async processLinkedInAnalytics(
    postId: string,
    analytics: {
      views: number;
      likes: number;
      comments: number;
      shares?: number;
      impressions?: number;
      clicks?: number;
      engagementRate?: number;
      reach?: number;
      mediaType?: 'text' | 'image' | 'video' | 'article' | 'document' | 'mixed';
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.LINKEDIN, {
        clicks: analytics.clicks ?? null,
        impressions: analytics.impressions ?? null,
        metricAvailability: {
          clicks: analytics.clicks == null ? 'unavailable' : 'observed',
          impressions:
            analytics.impressions == null ? 'unavailable' : 'observed',
          reach: analytics.reach == null ? 'unavailable' : 'observed',
          views: 'observed',
        },
        reach: analytics.reach ?? null,
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.shares || 0,
        totalViews: analytics.impressions || analytics.views,
      });

      this.logger.log(`Updated LinkedIn analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process LinkedIn analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Mastodon analytics and update post analytics
   * Note: Mastodon API does not expose view counts — views default to 0
   */
  async processMastodonAnalytics(
    postId: string,
    analytics: {
      views: number;
      likes: number;
      comments: number;
      boosts: number;
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.MASTODON, {
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.boosts,
        totalViews: 0, // Mastodon does not expose view counts
      });

      this.logger.log(`Updated Mastodon analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Mastodon analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Facebook analytics and update post analytics
   */
  async processFacebookAnalytics(
    postId: string,
    analytics: {
      views: number;
      likes: number;
      comments: number;
      shares: number;
      reach?: number;
      impressions?: number;
      engagementRate?: number;
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.FACEBOOK, {
        impressions: analytics.impressions ?? null,
        metricAvailability: {
          impressions:
            analytics.impressions == null ? 'unavailable' : 'observed',
          reach: analytics.reach == null ? 'unavailable' : 'observed',
          views: 'observed',
        },
        reach: analytics.reach ?? null,
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.shares,
        totalViews: analytics.impressions || analytics.views,
      });

      this.logger.log(`Updated Facebook analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Facebook analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process Threads analytics and update post analytics
   */
  async processThreadsAnalytics(
    postId: string,
    analytics: {
      views: number;
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.THREADS, {
        totalComments: analytics.replies,
        totalLikes: analytics.likes,
        totalShares: analytics.reposts + analytics.quotes,
        totalViews: analytics.views,
      });

      this.logger.log(`Updated Threads analytics for post ${postId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process Threads analytics for post ${postId}`,
        error,
      );
      throw error;
    }
  }
}
