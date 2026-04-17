import { CreateArticleAnalyticsDto } from '@api/collections/articles/dto/create-article-analytics.dto';
import { UpdateArticleAnalyticsDto } from '@api/collections/articles/dto/update-article-analytics.dto';
import { ArticleAnalyticsEntity } from '@api/collections/articles/entities/article-analytics.entity';
import type { ArticleAnalyticsDocument } from '@api/collections/articles/schemas/article-analytics.schema';
import {
  normalizePerformanceMetrics,
  type PerformanceMetricsInput,
} from '@api/collections/articles/utils/virality-analysis.mapper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ArticleAnalyticsService extends BaseService<
  ArticleAnalyticsDocument,
  CreateArticleAnalyticsDto,
  UpdateArticleAnalyticsDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'articleAnalytics', logger);
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

    const result = await this.delegate.upsert({
      where: {
        articleId_date: { articleId, date: today },
      },
      create: {
        ...data,
        articleId,
        clickThroughRate: 0,
        date: today,
        engagementRate: 0,
        isDeleted: false,
        totalComments: 0,
        totalLikes: 0,
        totalShares: 0,
        totalViews: 0,
      } as Record<string, unknown>,
      update: {},
    });

    return new ArticleAnalyticsEntity(result);
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
      articleId,
      date: yesterday,
      isDeleted: false,
    });

    // Get current values from yesterday or 0
    const yesterdayViews = yesterdayAnalytics?.totalViews || 0;
    const yesterdayLikes = yesterdayAnalytics?.totalLikes || 0;
    const yesterdayComments = yesterdayAnalytics?.totalComments || 0;
    const yesterdayShares = yesterdayAnalytics?.totalShares || 0;

    const todayAnalytics = await this.findOne({
      articleId,
      date: today,
      isDeleted: false,
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
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, isDeleted: false },
    });
    if (!article) {
      this.logger.error(`Article ${articleId} not found for analytics update`);
      throw new NotFoundException('Article not found');
    }

    const result = await this.delegate.upsert({
      where: {
        articleId_date: { articleId, date: today },
      },
      create: {
        articleId,
        brandId: (article as Record<string, unknown>).brandId as string,
        clickThroughRate: currentCTR,
        date: today,
        engagementRate,
        isDeleted: false,
        organizationId: (article as Record<string, unknown>)
          .organizationId as string,
        totalComments: currentComments,
        totalLikes: currentLikes,
        totalShares: currentShares,
        totalViews: currentViews,
        userId: (article as Record<string, unknown>).userId as string,
        ...increments,
      } as Record<string, unknown>,
      update: {
        clickThroughRate: currentCTR,
        engagementRate,
        totalComments: currentComments,
        totalLikes: currentLikes,
        totalShares: currentShares,
        totalViews: currentViews,
        ...increments,
      } as Record<string, unknown>,
    });

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
    const rows = await this.delegate.findMany({
      where: { articleId, isDeleted: false },
      orderBy: { date: 'desc' },
    });

    if (rows.length === 0) {
      return {
        avgClickThroughRate: 0,
        avgEngagementRate: 0,
        totalComments: 0,
        totalLikes: 0,
        totalShares: 0,
        totalViews: 0,
      };
    }

    const totalViews = Math.max(
      ...rows.map(
        (r) => ((r as Record<string, unknown>).totalViews as number) ?? 0,
      ),
    );
    const totalLikes = Math.max(
      ...rows.map(
        (r) => ((r as Record<string, unknown>).totalLikes as number) ?? 0,
      ),
    );
    const totalComments = Math.max(
      ...rows.map(
        (r) => ((r as Record<string, unknown>).totalComments as number) ?? 0,
      ),
    );
    const totalShares = Math.max(
      ...rows.map(
        (r) => ((r as Record<string, unknown>).totalShares as number) ?? 0,
      ),
    );
    const avgEngagementRate =
      rows.reduce(
        (sum, r) =>
          sum +
          (((r as Record<string, unknown>).engagementRate as number) ?? 0),
        0,
      ) / rows.length;
    const avgClickThroughRate =
      rows.reduce(
        (sum, r) =>
          sum +
          (((r as Record<string, unknown>).clickThroughRate as number) ?? 0),
        0,
      ) / rows.length;
    const lastUpdated = rows[0]
      ? ((rows[0] as Record<string, unknown>).updatedAt as Date)
      : undefined;

    return {
      avgClickThroughRate,
      avgEngagementRate,
      lastUpdated,
      totalComments,
      totalLikes,
      totalShares,
      totalViews,
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

    const results = await this.delegate.findMany({
      where: {
        articleId,
        date: { gte: start, lte: end },
        isDeleted: false,
      },
      orderBy: { date: 'desc' },
    });

    return results.map((doc) => new ArticleAnalyticsEntity(doc));
  }

  /**
   * Update performance metrics (convenience method that calls updateTodayAnalytics).
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
