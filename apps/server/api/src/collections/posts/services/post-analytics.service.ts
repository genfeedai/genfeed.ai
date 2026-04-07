import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';
import { PostAnalyticsEntity } from '@api/collections/posts/entities/post-analytics.entity';
import { PostDocument } from '@api/collections/posts/schemas/post.schema';
import {
  PostAnalytics,
  type PostAnalyticsDocument,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

// Shared grouping stages: summarize per platform taking the latest (max) totals,
// and average engagement rate across snapshots.
export const POST_ANALYTICS_PLATFORM_GROUP_PIPELINE: PipelineStage[] = [
  {
    $group: {
      _id: '$platform',
      avgEngagementRate: { $avg: '$engagementRate' },
      totalComments: { $max: '$totalComments' },
      totalLikes: { $max: '$totalLikes' },
      totalSaves: { $max: '$totalSaves' },
      totalShares: { $max: '$totalShares' },
      totalViews: { $max: '$totalViews' },
    },
  },
];

@Injectable()
export class PostAnalyticsService extends BaseService<
  PostAnalyticsDocument,
  CreatePostAnalyticsDto,
  Partial<CreatePostAnalyticsDto>
> {
  constructor(
    @InjectModel(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    protected readonly model: AggregatePaginateModel<PostAnalyticsDocument>,
    public readonly logger: LoggerService,

    private readonly postsService: PostsService,
    @Optional() private readonly instagramService?: InstagramService,
    @Optional() private readonly pinterestService?: PinterestService,
    @Optional() private readonly tiktokService?: TiktokService,
    @Optional() private readonly youtubeService?: YoutubeService,
    @Optional() private readonly twitterService?: TwitterService,
  ) {
    super(model, logger);
  }

  async findOrCreateTodayAnalytics(
    postId: string,
    platform: CredentialPlatform,
    data: Partial<CreatePostAnalyticsDto>,
  ): Promise<PostAnalyticsEntity> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Use findOneAndUpdate with upsert to avoid race conditions
      const result = await this.model.findOneAndUpdate(
        {
          date: today,
          platform,
          post: new Types.ObjectId(postId),
        },
        {
          $setOnInsert: {
            ...data,
            date: today,
            isDeleted: false,
            platform,
            post: new Types.ObjectId(postId),
            totalComments: 0,
            totalLikes: 0,
            totalShares: 0,
            totalViews: 0,
          },
        },
        {
          returnDocument: 'after',
          setDefaultsOnInsert: true,
          upsert: true,
        },
      );

      return new PostAnalyticsEntity(result);
    } catch (error: unknown) {
      // Handle duplicate key error in case of race condition
      if ((error as { code?: number })?.code === 11000) {
        const existing = await this.findOne({
          date: today,
          platform,
          post: new Types.ObjectId(postId),
        });

        if (existing) {
          return new PostAnalyticsEntity(existing);
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

    const yesterdayAnalytics = await this.findOne({
      date: yesterday,
      platform,
      post: new Types.ObjectId(postId),
    });

    const increments = {
      totalCommentsIncrement:
        metrics.totalComments - (yesterdayAnalytics?.totalComments || 0),
      totalLikesIncrement:
        metrics.totalLikes - (yesterdayAnalytics?.totalLikes || 0),
      totalSavesIncrement:
        (metrics.totalSaves || 0) - (yesterdayAnalytics?.totalSaves || 0),
      totalSharesIncrement:
        (metrics.totalShares || 0) - (yesterdayAnalytics?.totalShares || 0),
      totalViewsIncrement:
        metrics.totalViews - (yesterdayAnalytics?.totalViews || 0),
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

    const filter = {
      date: today,
      platform,
      post: new Types.ObjectId(postId),
    };

    const update = {
      $set: {
        ...metrics,
        ...increments,
        engagementRate,
      },
      $setOnInsert: {
        brand: post.brand,
        ingredients: post.ingredients,
        organization: post.organization,
        user: post.user,
      },
    };

    const result = await this.model
      .findOneAndUpdate(filter, update, {
        returnDocument: 'after',
        upsert: true,
      })
      .exec();

    return result ? new PostAnalyticsEntity(result) : null;
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
    const results = await this.model
      .aggregate([
        { $match: { post: new Types.ObjectId(postId) } },
        ...POST_ANALYTICS_PLATFORM_GROUP_PIPELINE,
      ])
      .exec();

    const platforms = results.reduce(
      (acc, result) => {
        acc[result._id] = {
          engagementRate: result.avgEngagementRate,
          totalComments: result.totalComments,
          totalLikes: result.totalLikes,
          totalSaves: result.totalSaves,
          totalShares: result.totalShares,
          totalViews: result.totalViews,
        };
        return acc;
      },
      {} as Record<
        string,
        {
          engagementRate: number;
          totalComments: number;
          totalLikes: number;
          totalSaves: number;
          totalShares: number;
          totalViews: number;
        }
      >,
    );

    const totals = results.reduce(
      (acc, result) => ({
        comments: acc.comments + result.totalComments,
        engagement: acc.engagement + result.avgEngagementRate,
        likes: acc.likes + result.totalLikes,
        saves: acc.saves + result.totalSaves,
        shares: acc.shares + result.totalShares,
        views: acc.views + result.totalViews,
      }),
      { comments: 0, engagement: 0, likes: 0, saves: 0, shares: 0, views: 0 },
    );

    return {
      avgEngagementRate:
        results.length > 0 ? totals.engagement / results.length : 0,
      platforms,
      totalComments: totals.comments,
      totalLikes: totals.likes,
      totalSaves: totals.saves,
      totalShares: totals.shares,
      totalViews: totals.views,
    };
  }

  async getAnalyticsByDateRange(
    postId: string,
    startDate: Date,
    endDate: Date,
    platform?: string,
  ): Promise<PostAnalyticsEntity[]> {
    const match: Record<string, unknown> = {
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      post: new Types.ObjectId(postId),
    };

    if (platform) {
      match.platform = platform;
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { date: 1 } },
    ];

    const result = await this.model.aggregate(pipeline).exec();
    return result.map(
      (doc: Partial<PostAnalytics>) => new PostAnalyticsEntity(doc),
    );
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

      // Only fetch analytics if we have an external ID
      const postId = post._id?.toString() || String(post._id);
      if (!post.externalId) {
        this.logger.warn(`${url} No external ID for post ${postId}`);
        return;
      }

      switch (platform) {
        case CredentialPlatform.YOUTUBE:
          analytics = await this.getYoutubeAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;

        case CredentialPlatform.TIKTOK:
          analytics = await this.getTiktokAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;

        case CredentialPlatform.INSTAGRAM:
          analytics = await this.getInstagramAnalytics(
            post.organization.toString(),
            post.brand.toString(),
            post.externalId,
          );
          break;

        case CredentialPlatform.TWITTER:
          analytics = await this.getTwitterAnalytics(post.externalId);
          break;

        case CredentialPlatform.PINTEREST:
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
        // Validate required post fields
        if (
          !post._id ||
          !post.ingredients ||
          post.ingredients.length === 0 ||
          !post.user
        ) {
          this.logger.error(`${url} Missing required post fields`, {
            postId: postId,
          });
          return;
        }

        // Create or update today's analytics
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await this.findOrCreateTodayAnalytics(postId, platform, {
          brand: post.brand,
          date: today,
          engagementRate: 0,
          ingredients: post.ingredients,
          organization: post.organization,
          platform,
          post: new Types.ObjectId(post._id.toString()),
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
          user: post.user,
        });

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
        totalSaves: 0, // YouTube doesn't provide save count via API
        totalShares: 0, // YouTube doesn't provide share count via API
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
        totalSaves: 0, // TikTok API may not provide saves
        totalShares: 0, // TikTok API may not provide shares
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
        totalSaves: 0, // Would need additional API call for saves
        totalShares: 0, // Instagram doesn't provide share count for posts
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
      await this.updateTodayAnalytics(postId, CredentialPlatform.TWITTER, {
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
      await this.updateTodayAnalytics(postId, CredentialPlatform.YOUTUBE, {
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
      await this.updateTodayAnalytics(postId, CredentialPlatform.INSTAGRAM, {
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
      await this.updateTodayAnalytics(postId, CredentialPlatform.TIKTOK, {
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
      await this.updateTodayAnalytics(postId, CredentialPlatform.PINTEREST, {
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
