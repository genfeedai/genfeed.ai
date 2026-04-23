import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';
import { PostAnalyticsEntity } from '@api/collections/posts/entities/post-analytics.entity';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import type { PostAnalyticsDocument } from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { CredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

const CREDENTIAL_PLATFORM = {
  INSTAGRAM: 'INSTAGRAM' as CredentialPlatform,
  PINTEREST: 'PINTEREST' as CredentialPlatform,
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
    @Optional() private readonly instagramService?: InstagramService,
    @Optional() private readonly pinterestService?: PinterestService,
    @Optional() private readonly tiktokService?: TiktokService,
    @Optional() private readonly youtubeService?: YoutubeService,
    @Optional() private readonly twitterService?: TwitterService,
  ) {
    super(prisma, 'postAnalytics', logger);
  }

  async findOrCreateTodayAnalytics(
    postId: string,
    platform: CredentialPlatform,
    data: Partial<CreatePostAnalyticsDto>,
  ): Promise<PostAnalyticsEntity> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Use upsert to avoid race conditions
      const result = await this.prisma.postAnalytics.upsert({
        create: {
          ...data,
          date: today,
          isDeleted: false,
          platform,
          postId,
          totalComments: 0,
          totalLikes: 0,
          totalShares: 0,
          totalViews: 0,
        } as never,
        update: {},
        where: {
          postId_platform_date: { date: today, platform, postId },
        } as never,
      });

      return new PostAnalyticsEntity(result as never);
    } catch (error: unknown) {
      // Handle duplicate key error in case of race condition
      if ((error as { code?: string })?.code === 'P2002') {
        const existing = await this.prisma.postAnalytics.findFirst({
          where: { date: today, platform, postId },
        });

        if (existing) {
          return new PostAnalyticsEntity(existing as never);
        }
      }
      throw error;
    }
  }

  async updateTodayAnalytics(
    postId: string,
    platform: CredentialPlatform,
    metrics: {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares?: number;
      totalSaves?: number;
    },
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
    const post = await this.postsService.findOne({ _id: postId });
    if (!post) {
      this.logger.error(`Post ${postId} not found for analytics update`);
      return null;
    }

    const result = await this.prisma.postAnalytics.upsert({
      create: {
        brandId: String(post.brand),
        date: today,
        engagementRate,
        isDeleted: false,
        organizationId: String(post.organization),
        platform,
        postId,
        userId: String(post.user),
        ...metrics,
        ...increments,
      } as never,
      update: {
        engagementRate,
        ...metrics,
        ...increments,
      } as never,
      where: {
        postId_platform_date: { date: today, platform, postId },
      } as never,
    });

    return result ? new PostAnalyticsEntity(result as never) : null;
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

    // Group in-memory (replaces MongoDB $group aggregation)
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
      where: where as never,
    });

    return results.map((doc) => new PostAnalyticsEntity(doc as never));
  }

  async trackPostAnalytics(
    post: PostDocument,
    credential: CredentialEntity,
    url: string,
  ) {
    try {
      const platform = credential.platform;
      let analytics: {
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
      } | null = null;

      const postId = post._id?.toString() || String(post._id);
      if (!post.externalId) {
        this.logger.warn(`${url} No external ID for post ${postId}`);
        return;
      }

      switch (platform) {
        case CREDENTIAL_PLATFORM.YOUTUBE:
          analytics = await this.getYoutubeAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;

        case CREDENTIAL_PLATFORM.TIKTOK:
          analytics = await this.getTiktokAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;

        case CREDENTIAL_PLATFORM.INSTAGRAM:
          analytics = await this.getInstagramAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;

        case CREDENTIAL_PLATFORM.TWITTER:
          analytics = await this.getTwitterAnalytics(post.externalId);
          break;

        case CREDENTIAL_PLATFORM.PINTEREST:
          analytics = await this.getPinterestAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;
        default:
          this.logger.warn(`${url} unsupported platform: ${platform}`);
          return;
      }

      if (analytics) {
        const postIngredients = Array.isArray(post.ingredients)
          ? post.ingredients
          : [];
        if (!post._id || postIngredients.length === 0 || !post.user) {
          this.logger.error(`${url} Missing required post fields`, {
            postId: postId,
          });
          return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await this.findOrCreateTodayAnalytics(postId, platform, {
          brandId: post.brand.toString(),
          date: today,
          engagementRate: 0,
          organizationId: post.organization.toString(),
          platform,
          postId,
          totalComments: 0,
          totalCommentsIncrement: 0,
          totalLikes: 0,
          totalLikesIncrement: 0,
          totalSaves: 0,
          totalSavesIncrement: 0,
          totalShares: 0,
          totalSharesIncrement: 0,
          totalViews: 0,
          totalViewsIncrement: 0,
          userId: post.user.toString(),
        } as never);

        await this.updateTodayAnalytics(postId, platform, analytics);

        this.logger.log(
          `${url} tracked analytics for post ${postId} on ${platform}`,
          {
            totalComments: analytics.totalComments,
            totalLikes: analytics.totalLikes,
            totalViews: analytics.totalViews,
          },
        );
      }
    } catch (error: unknown) {
      const postId = post._id?.toString() || String(post._id);
      this.logger.error(
        `${url} failed to track analytics for post ${postId}`,
        error,
      );
    }
  }

  private async getYoutubeAnalytics(
    organizationId: string,
    brandId: string,
    videoId: string,
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
  } | null> {
    try {
      // @ts-expect-error TS2532
      const stats = await this.youtubeService.getMediaAnalytics(
        organizationId,
        brandId,
        videoId,
      );
      return {
        totalComments: stats.comments,
        totalLikes: stats.likes,
        totalSaves: 0,
        totalShares: 0,
        totalViews: stats.views,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get YouTube analytics', error);
      return null;
    }
  }

  private async getTiktokAnalytics(
    organizationId: string,
    brandId: string,
    videoId: string,
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
  } | null> {
    try {
      // @ts-expect-error TS2532
      const stats = await this.tiktokService.getMediaAnalytics(
        organizationId,
        brandId,
        videoId,
      );
      return {
        totalComments: stats.comments,
        totalLikes: stats.likes,
        totalSaves: 0,
        totalShares: 0,
        totalViews: stats.views,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get TikTok analytics', error);
      return null;
    }
  }

  private async getInstagramAnalytics(
    organizationId: string,
    brandId: string,
    mediaId: string,
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
  } | null> {
    try {
      // @ts-expect-error TS2532
      const stats = await this.instagramService.getMediaAnalytics(
        organizationId,
        brandId,
        mediaId,
      );

      return {
        totalComments: stats.comments,
        totalLikes: stats.likes,
        totalSaves: 0,
        totalShares: 0,
        totalViews: stats.views,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get Instagram analytics', error);
      return null;
    }
  }

  private async getTwitterAnalytics(tweetId: string): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
  } | null> {
    try {
      // @ts-expect-error TS2532
      const stats = await this.twitterService.getMediaAnalytics(tweetId);

      return {
        totalComments: stats.comments,
        totalLikes: stats.likes,
        totalSaves: 0,
        totalShares: 0,
        totalViews: stats.views,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get Twitter analytics', error);
      return null;
    }
  }

  private async getPinterestAnalytics(
    organizationId: string,
    brandId: string,
    pinId: string,
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
  } | null> {
    try {
      // @ts-expect-error TS2532
      const stats = await this.pinterestService.getMediaAnalytics(
        organizationId,
        brandId,
        pinId,
      );
      return {
        totalComments: stats.comments,
        totalLikes: stats.likes,
        totalSaves: stats.saves || 0,
        totalShares: 0,
        totalViews: stats.views || stats.impressions || 0,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get Pinterest analytics', error);
      return null;
    }
  }

  /**
   * Process Twitter analytics from batch fetch and update post analytics
   */
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
    analytics: {
      views: number;
      likes: number;
      comments: number;
      dislikes?: number;
      favorites?: number;
      shares?: number;
      estimatedMinutesWatched?: number;
      averageViewDuration?: number;
      averageViewPercentage?: number;
      subscribersGained?: number;
      subscribersLost?: number;
      impressions?: number;
      clickThroughRate?: number;
      engagementRate?: number;
      mediaType?: 'video' | 'short';
      duration?: number;
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.YOUTUBE, {
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.shares || 0,
        totalViews: analytics.views,
      });

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
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.shares || 0,
        totalViews:
          analytics.views || analytics.impressions || analytics.reach || 0,
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
    analytics: {
      views: number;
      likes: number;
      comments: number;
      shares: number;
      saves?: number;
      totalPlayTime?: number;
      averagePlayTime?: number;
      reach?: number;
      engagementRate?: number;
    },
  ): Promise<void> {
    try {
      await this.updateTodayAnalytics(postId, CREDENTIAL_PLATFORM.TIKTOK, {
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
        totalShares: analytics.shares,
        totalViews: analytics.views,
      });

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
        totalComments: analytics.comments,
        totalLikes: analytics.likes,
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
}
