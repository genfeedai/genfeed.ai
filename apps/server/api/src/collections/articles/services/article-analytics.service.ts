import { CreateArticleAnalyticsDto } from '@api/collections/articles/dto/create-article-analytics.dto';
import { UpdateArticleAnalyticsDto } from '@api/collections/articles/dto/update-article-analytics.dto';
import { ArticleAnalyticsEntity } from '@api/collections/articles/entities/article-analytics.entity';
import type { ArticleAnalyticsDocument } from '@api/collections/articles/schemas/article-analytics.schema';
import {
  normalizePerformanceMetrics,
  type PerformanceMetricsInput,
} from '@api/collections/articles/utils/virality-analysis.mapper';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ArticleAnalyticsService extends BaseService<
  ArticleAnalyticsDocument,
  CreateArticleAnalyticsDto,
  UpdateArticleAnalyticsDto,
  Prisma.ArticleAnalyticsWhereInput
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

    const article = await findOrThrow(
      this.prisma.article,
      { where: { id: articleId, isDeleted: false } },
      'Article',
    );

    const result = await this.prisma.articleAnalytics.upsert({
      where: {
        articleId_date: { articleId, date: today },
      },
      create: {
        articleId,
        brandId: article.brandId,
        date: today,
        engagementRate: 0,
        isDeleted: false,
        organizationId: article.organizationId,
        totalComments: 0,
        totalLikes: 0,
        totalShares: 0,
        totalViews: data.totalViews ?? 0,
        userId: article.userId,
      },
      update: {},
    });

    return new ArticleAnalyticsEntity(result);
  }

  /** Update today's analytics snapshot and engagement rate. */
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

    const todayAnalytics = await this.findOne({
      articleId,
      date: today,
    });

    const currentViews = metrics.totalViews ?? todayAnalytics?.totalViews ?? 0;
    const currentLikes = metrics.totalLikes ?? todayAnalytics?.totalLikes ?? 0;
    const currentComments =
      metrics.totalComments ?? todayAnalytics?.totalComments ?? 0;
    const currentShares =
      metrics.totalShares ?? todayAnalytics?.totalShares ?? 0;

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
      throw new NotFoundException('Article');
    }

    const result = await this.prisma.articleAnalytics.upsert({
      where: {
        articleId_date: { articleId, date: today },
      },
      create: {
        articleId,
        brandId: article.brandId,
        date: today,
        engagementRate,
        isDeleted: false,
        organizationId: article.organizationId,
        totalComments: currentComments,
        totalLikes: currentLikes,
        totalShares: currentShares,
        totalViews: currentViews,
        userId: article.userId,
      },
      update: {
        engagementRate,
        totalComments: currentComments,
        totalLikes: currentLikes,
        totalShares: currentShares,
        totalViews: currentViews,
      },
    });

    return result ? new ArticleAnalyticsEntity(result) : null;
  }

  /**
   * Get analytics summary for an article (aggregated across all dates)
   */
  async getArticleAnalyticsSummary(
    articleId: string,
    organizationId: string,
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    avgEngagementRate: number;
    avgClickThroughRate: number;
    lastUpdated?: Date;
  }> {
    const where = scopedWhere(organizationId, { articleId });
    const [summary, latest] = await Promise.all([
      this.prisma.articleAnalytics.aggregate({
        _avg: { engagementRate: true },
        _max: {
          totalComments: true,
          totalLikes: true,
          totalShares: true,
          totalViews: true,
        },
        where,
      }),
      this.prisma.articleAnalytics.findFirst({
        orderBy: { date: 'desc' },
        select: { updatedAt: true },
        where,
      }),
    ]);

    if (!latest) {
      return {
        avgClickThroughRate: 0,
        avgEngagementRate: 0,
        totalComments: 0,
        totalLikes: 0,
        totalShares: 0,
        totalViews: 0,
      };
    }

    return {
      avgClickThroughRate: 0,
      avgEngagementRate: summary._avg.engagementRate ?? 0,
      lastUpdated: latest.updatedAt,
      totalComments: summary._max.totalComments ?? 0,
      totalLikes: summary._max.totalLikes ?? 0,
      totalShares: summary._max.totalShares ?? 0,
      totalViews: summary._max.totalViews ?? 0,
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
