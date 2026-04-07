import { CreateArticleAnalyticsDto } from '@api/collections/articles/dto/create-article-analytics.dto';
import { UpdateArticleAnalyticsDto } from '@api/collections/articles/dto/update-article-analytics.dto';
import { ArticleAnalyticsEntity } from '@api/collections/articles/entities/article-analytics.entity';
import {
  Article,
  type ArticleDocument,
} from '@api/collections/articles/schemas/article.schema';
import {
  ArticleAnalytics,
  type ArticleAnalyticsDocument,
} from '@api/collections/articles/schemas/article-analytics.schema';
import {
  normalizePerformanceMetrics,
  type PerformanceMetricsInput,
} from '@api/collections/articles/utils/virality-analysis.mapper';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type PipelineStage, Types } from 'mongoose';

@Injectable()
export class ArticleAnalyticsService extends BaseService<
  ArticleAnalyticsDocument,
  CreateArticleAnalyticsDto,
  UpdateArticleAnalyticsDto
> {
  constructor(
    @InjectModel(ArticleAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    protected readonly model: AggregatePaginateModel<ArticleAnalyticsDocument>,
    public readonly logger: LoggerService,
    @Optional()
    @InjectModel(Article.name, DB_CONNECTIONS.CLOUD)
    private readonly articleModel?: Model<ArticleDocument>,
  ) {
    super(model, logger);
  }

  /**
   * Find or create analytics record for today
   */
  async findOrCreateTodayAnalytics(
    articleId: string,
    data: Partial<CreateArticleAnalyticsDto>,
  ): Promise<ArticleAnalyticsEntity> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Use findOneAndUpdate with upsert to avoid race conditions
      const result = await this.model.findOneAndUpdate(
        {
          article: new Types.ObjectId(articleId),
          date: today,
        },
        {
          $setOnInsert: {
            ...data,
            article: new Types.ObjectId(articleId),
            clickThroughRate: 0,
            date: today,
            engagementRate: 0,
            isDeleted: false,
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

      return new ArticleAnalyticsEntity(result);
    } catch (error: unknown) {
      // Handle duplicate key error in case of race condition
      // @ts-expect-error TS2367
      if ((error as { code?: string }).code === 11000) {
        const existing = await this.findOne({
          article: new Types.ObjectId(articleId),
          date: today,
        });
        if (existing) {
          return new ArticleAnalyticsEntity(existing);
        }
      }
      throw error;
    }
  }

  /**
   * Update analytics for today, calculating increments from yesterday
   */
  async updateTodayAnalytics(
    articleId: string,
    metrics: {
      totalViews?: number;
      totalLikes?: number;
      totalComments?: number;
      totalShares?: number;
      clickThroughRate?: number;
    },
  ): Promise<ArticleAnalyticsEntity | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find yesterday's analytics to calculate increments
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayAnalytics = await this.findOne({
      article: new Types.ObjectId(articleId),
      date: yesterday,
    });

    // Get current values from yesterday or 0
    const yesterdayViews = yesterdayAnalytics?.totalViews || 0;
    const yesterdayLikes = yesterdayAnalytics?.totalLikes || 0;
    const yesterdayComments = yesterdayAnalytics?.totalComments || 0;
    const yesterdayShares = yesterdayAnalytics?.totalShares || 0;

    // Use provided metrics or get from today's record if it exists
    const todayAnalytics = await this.findOne({
      article: new Types.ObjectId(articleId),
      date: today,
    });

    const currentViews = metrics.totalViews ?? todayAnalytics?.totalViews ?? 0;
    const currentLikes = metrics.totalLikes ?? todayAnalytics?.totalLikes ?? 0;
    const currentComments =
      metrics.totalComments ?? todayAnalytics?.totalComments ?? 0;
    const currentShares =
      metrics.totalShares ?? todayAnalytics?.totalShares ?? 0;
    const currentCTR =
      metrics.clickThroughRate ?? todayAnalytics?.clickThroughRate ?? 0;

    const increments = {
      totalCommentsIncrement: Math.max(0, currentComments - yesterdayComments),
      totalLikesIncrement: Math.max(0, currentLikes - yesterdayLikes),
      totalSharesIncrement: Math.max(0, currentShares - yesterdayShares),
      totalViewsIncrement: Math.max(0, currentViews - yesterdayViews),
    };

    // Calculate engagement rate
    const engagementRate =
      currentViews > 0
        ? ((currentLikes + currentComments + currentShares) / currentViews) *
          100
        : 0;

    // Fetch article to get required fields for upsert
    if (!this.articleModel) {
      throw new Error('Article model not available');
    }

    const article = await this.articleModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(articleId),
      isDeleted: false,
    });
    if (!article) {
      this.logger.error(`Article ${articleId} not found for analytics update`);
      throw new NotFoundException('Article not found');
    }

    const filter = {
      article: new Types.ObjectId(articleId),
      date: today,
    };

    const update = {
      $set: {
        clickThroughRate: currentCTR,
        totalComments: currentComments,
        totalLikes: currentLikes,
        totalShares: currentShares,
        totalViews: currentViews,
        ...increments,
        engagementRate,
      },
      $setOnInsert: {
        brand: article.brand,
        organization: article.organization,
        user: article.user,
      },
    };

    const result = await this.model
      .findOneAndUpdate(filter, update, {
        returnDocument: 'after',
        upsert: true,
      })
      .exec();

    return result ? new ArticleAnalyticsEntity(result) : null;
  }

  /**
   * Get analytics summary for an article (aggregated across all dates)
   */
  async getArticleAnalyticsSummary(articleId: string): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    avgEngagementRate: number;
    avgClickThroughRate: number;
    lastUpdated?: Date;
  }> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          article: new Types.ObjectId(articleId),
          isDeleted: false,
        },
      },
      {
        $sort: { date: -1 },
      },
      {
        $group: {
          _id: null,
          avgClickThroughRate: { $avg: '$clickThroughRate' },
          avgEngagementRate: { $avg: '$engagementRate' },
          lastUpdated: { $max: '$updatedAt' },
          totalComments: { $max: '$totalComments' },
          totalLikes: { $max: '$totalLikes' },
          totalShares: { $max: '$totalShares' },
          totalViews: { $max: '$totalViews' },
        },
      },
    ];

    const results = await this.model.aggregate(pipeline).exec();

    if (results.length === 0) {
      return {
        avgClickThroughRate: 0,
        avgEngagementRate: 0,
        totalComments: 0,
        totalLikes: 0,
        totalShares: 0,
        totalViews: 0,
      };
    }

    const result = results[0];
    return {
      avgClickThroughRate: result.avgClickThroughRate || 0,
      avgEngagementRate: result.avgEngagementRate || 0,
      lastUpdated: result.lastUpdated,
      totalComments: result.totalComments || 0,
      totalLikes: result.totalLikes || 0,
      totalShares: result.totalShares || 0,
      totalViews: result.totalViews || 0,
    };
  }

  /**
   * Get analytics by date range
   */
  async getAnalyticsByDateRange(
    articleId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ArticleAnalyticsEntity[]> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const results = await this.model
      .find({
        article: new Types.ObjectId(articleId),
        date: { $gte: start, $lte: end },
        isDeleted: false,
      })
      .sort({ date: -1 })
      .exec();

    return results.map((doc) => new ArticleAnalyticsEntity(doc.toObject()));
  }

  /**
   * Update performance metrics (convenience method that calls updateTodayAnalytics).
   * Uses the shared PerformanceMetricsInput type and normalizePerformanceMetrics
   * mapper from virality-analysis.mapper to stay consistent with
   * ArticlesAnalyticsService.
   */
  async updatePerformanceMetrics(
    articleId: string,
    metrics: PerformanceMetricsInput,
  ): Promise<void> {
    const normalized = normalizePerformanceMetrics(metrics);
    await this.updateTodayAnalytics(articleId, {
      clickThroughRate: normalized.clickThroughRate,
      totalComments: normalized.comments,
      totalLikes: normalized.likes,
      totalShares: normalized.shares,
      totalViews: normalized.views,
    });
  }
}
