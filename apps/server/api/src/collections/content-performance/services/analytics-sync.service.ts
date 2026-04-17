import type { ContentPerformanceDocument } from '@api/collections/content-performance/schemas/content-performance.schema';
import { PerformanceSource } from '@api/collections/content-performance/schemas/content-performance.schema';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentType, PostCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface AnalyticsSyncResult {
  synced: number;
  skipped: number;
  errors: number;
  organizationId: string;
  brandId?: string;
}

export interface AnalyticsSyncOptions {
  organizationId: string;
  brandId?: string;
  /** Only sync analytics newer than this date */
  since?: Date;
  /** Batch size for processing */
  batchSize?: number;
}

@Injectable()
export class AnalyticsSyncService {
  private static readonly DEFAULT_BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandMemorySyncService: BrandMemorySyncService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Map PostCategory to ContentType
   */
  private mapCategoryToContentType(category?: string): ContentType {
    const mapping: Record<string, ContentType> = {
      [PostCategory.VIDEO]: ContentType.VIDEO,
      [PostCategory.REEL]: ContentType.VIDEO,
      [PostCategory.IMAGE]: ContentType.IMAGE,
      [PostCategory.ARTICLE]: ContentType.ARTICLE,
      [PostCategory.TEXT]: ContentType.CAPTION,
      [PostCategory.POST]: ContentType.CAPTION,
      [PostCategory.STORY]: ContentType.IMAGE,
    };
    return category
      ? (mapping[category] ?? ContentType.CAPTION)
      : ContentType.CAPTION;
  }

  /**
   * Compute engagement rate from analytics metrics
   */
  private computeEngagementRate(metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  }): number {
    if (metrics.views === 0) return 0;
    return Number(
      (
        ((metrics.likes + metrics.comments + metrics.shares + metrics.saves) /
          metrics.views) *
        100
      ).toFixed(2),
    );
  }

  /**
   * Compute performance score (0-100) from metrics
   */
  private computePerformanceScore(metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
  }): number {
    if (metrics.views === 0) return 0;
    const engagementRate =
      ((metrics.likes +
        metrics.comments +
        metrics.shares +
        metrics.saves +
        metrics.clicks) /
        metrics.views) *
      100;
    return Math.min(100, Math.round(engagementRate * 10));
  }

  /**
   * Sync platform analytics data into the closed-loop ContentPerformance collection.
   */
  async syncAnalytics(
    options: AnalyticsSyncOptions,
  ): Promise<AnalyticsSyncResult> {
    const {
      organizationId,
      brandId,
      since,
      batchSize = AnalyticsSyncService.DEFAULT_BATCH_SIZE,
    } = options;

    this.logger.log(
      `Starting analytics sync for org=${organizationId}${brandId ? ` brand=${brandId}` : ''}`,
    );

    const result: AnalyticsSyncResult = {
      brandId,
      errors: 0,
      organizationId,
      skipped: 0,
      synced: 0,
    };
    const touchedBrandIds = new Set<string>();

    const postAnalyticsWhere: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (brandId) {
      postAnalyticsWhere.brandId = brandId;
    }

    if (since) {
      postAnalyticsWhere.date = { gte: since };
    }

    // Process in batches
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const analyticsBatch = await this.prisma.postAnalytics.findMany({
        where: postAnalyticsWhere as Parameters<
          typeof this.prisma.postAnalytics.findMany
        >[0]['where'],
        orderBy: { date: 'desc' },
        skip,
        take: batchSize,
      });

      if (analyticsBatch.length === 0) {
        hasMore = false;
        break;
      }

      // Collect post IDs to batch-fetch post data
      const postIds = [...new Set(analyticsBatch.map((a) => String(a.postId)))];
      const posts = await this.prisma.post.findMany({
        where: {
          id: { in: postIds },
          isDeleted: false,
          organizationId,
        },
      });
      const postMap = new Map(posts.map((p) => [p.id, p]));

      for (const analytics of analyticsBatch) {
        try {
          const post = postMap.get(String(analytics.postId));

          const metrics = {
            clicks: 0,
            comments: analytics.totalComments ?? 0,
            likes: analytics.totalLikes ?? 0,
            saves: analytics.totalSaves ?? 0,
            shares: analytics.totalShares ?? 0,
            views: analytics.totalViews ?? 0,
          };

          const measuredAt = new Date(analytics.date);

          await this.prisma.contentPerformance.upsert({
            where: {
              organizationId_postId_measuredAt_source: {
                organizationId,
                postId: String(analytics.postId),
                measuredAt,
                source: PerformanceSource.API,
              },
            },
            create: {
              brandId: analytics.brandId ?? undefined,
              clicks: metrics.clicks,
              comments: metrics.comments,
              contentRunId: post?.contentRunId ?? undefined,
              contentType: this.mapCategoryToContentType(
                post?.category ?? undefined,
              ),
              creativeVersion: post?.creativeVersion ?? undefined,
              engagementRate: this.computeEngagementRate(metrics),
              externalPostId: post?.externalId ?? undefined,
              generationId: post?.generationId ?? undefined,
              hookVersion: post?.hookVersion ?? undefined,
              isDeleted: false,
              likes: metrics.likes,
              measuredAt,
              organizationId,
              performanceScore: this.computePerformanceScore(metrics),
              platform: analytics.platform ?? undefined,
              postId: String(analytics.postId),
              revenue: 0,
              saves: metrics.saves,
              source: PerformanceSource.API,
              userId: analytics.userId ?? undefined,
              views: metrics.views,
            } as Record<string, unknown>,
            update: {
              brandId: analytics.brandId ?? undefined,
              clicks: metrics.clicks,
              comments: metrics.comments,
              contentType: this.mapCategoryToContentType(
                post?.category ?? undefined,
              ),
              engagementRate: this.computeEngagementRate(metrics),
              likes: metrics.likes,
              measuredAt,
              performanceScore: this.computePerformanceScore(metrics),
              saves: metrics.saves,
              shares: metrics.shares,
              views: metrics.views,
            } as Record<string, unknown>,
          });

          result.synced++;

          const resolvedBrandId = analytics.brandId ?? undefined;
          if (resolvedBrandId && post?.id) {
            touchedBrandIds.add(resolvedBrandId);
            try {
              await this.brandMemorySyncService.syncPostPerformance(
                organizationId,
                resolvedBrandId,
                post.id,
              );
            } catch (syncError) {
              this.logger.error(
                `Failed to sync brand memory for post ${post.id}`,
                syncError,
              );
            }
          }
        } catch (error) {
          result.errors++;
          this.logger.error(
            `Failed to sync analytics for post ${analytics.postId}`,
            error,
          );
        }
      }

      skip += batchSize;
      if (analyticsBatch.length < batchSize) {
        hasMore = false;
      }
    }

    for (const touchedBrandId of touchedBrandIds) {
      try {
        const alerts = await this.brandMemorySyncService.detectThresholdAlerts(
          organizationId,
          touchedBrandId,
        );
        for (const alert of alerts) {
          this.logger.warn(
            `Engagement ${alert.type} detected for brand=${touchedBrandId}`,
            alert,
          );
        }
      } catch (alertError) {
        this.logger.error(
          `Failed to detect threshold alerts for brand=${touchedBrandId}`,
          alertError,
        );
      }
    }

    this.logger.log(
      `Analytics sync completed for org=${organizationId}: synced=${result.synced}, skipped=${result.skipped}, errors=${result.errors}`,
    );

    return result;
  }

  /**
   * Get the most recent sync date for an organization to enable incremental syncs.
   */
  async getLastSyncDate(
    organizationId: string,
    brandId?: string,
  ): Promise<Date | null> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
      source: PerformanceSource.API,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    const latest = await this.prisma.contentPerformance.findFirst({
      where: where as Parameters<
        typeof this.prisma.contentPerformance.findFirst
      >[0]['where'],
      orderBy: { measuredAt: 'desc' },
    });

    return (latest as ContentPerformanceDocument | null)?.measuredAt ?? null;
  }
}
