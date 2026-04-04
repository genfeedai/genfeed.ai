import {
  ContentPerformance,
  type ContentPerformanceDocument,
  PerformanceSource,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import {
  Post,
  type PostDocument,
} from '@api/collections/posts/schemas/post.schema';
import {
  PostAnalytics,
  type PostAnalyticsDocument,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { IAnalyticsMatchStage } from '@genfeedai/interfaces';
import { ContentType, PostCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';

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
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly contentPerformanceModel: AggregatePaginateModel<ContentPerformanceDocument>,
    @InjectModel(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    private readonly postAnalyticsModel: Model<PostAnalyticsDocument>,
    @InjectModel(Post.name, DB_CONNECTIONS.CLOUD)
    private readonly postModel: Model<PostDocument>,
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
   *
   * Reads from PostAnalytics (populated by analytics-twitter, analytics-social, etc.),
   * joins with Post data (for generationId, promptUsed, etc.),
   * and upserts into ContentPerformance.
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

    // Build match filter for PostAnalytics
    const matchFilter: IAnalyticsMatchStage = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      matchFilter.brand = new Types.ObjectId(brandId);
    }

    if (since) {
      matchFilter.date = { $gte: since };
    }

    // Process in batches using cursor
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const analyticsBatch = await this.postAnalyticsModel
        .find(matchFilter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(batchSize)
        .lean()
        .exec();

      if (analyticsBatch.length === 0) {
        hasMore = false;
        break;
      }

      // Collect post IDs to batch-fetch post data
      const postIds = [
        ...new Set(analyticsBatch.map((a) => a.post.toString())),
      ];
      const posts = await this.postModel
        .find({
          _id: { $in: postIds.map((id) => new Types.ObjectId(id)) },
          isDeleted: { $ne: true },
          organization: new Types.ObjectId(organizationId),
        })
        .lean()
        .exec();
      const postMap = new Map(posts.map((p) => [p._id.toString(), p]));

      for (const analytics of analyticsBatch) {
        try {
          const post = postMap.get(analytics.post.toString());

          const metrics = {
            clicks: 0,
            comments: analytics.totalComments ?? 0,
            likes: analytics.totalLikes ?? 0,
            saves: analytics.totalSaves ?? 0,
            shares: analytics.totalShares ?? 0,
            views: analytics.totalViews ?? 0,
          };

          // Upsert: unique on post + measuredAt date (day granularity)
          const measuredAt = new Date(analytics.date);

          const updateResult =
            await this.contentPerformanceModel.findOneAndUpdate(
              {
                isDeleted: { $ne: true },
                measuredAt,
                organization: new Types.ObjectId(organizationId),
                post: analytics.post,
                source: PerformanceSource.API,
              },
              {
                $set: {
                  brand: analytics.brand,
                  clicks: metrics.clicks,
                  comments: metrics.comments,
                  contentType: this.mapCategoryToContentType(post?.category),
                  engagementRate: this.computeEngagementRate(metrics),
                  externalPostId: post?.externalId,
                  generationId: post?.generationId,
                  hookUsed: undefined,
                  likes: metrics.likes,
                  measuredAt,
                  organization: new Types.ObjectId(organizationId),
                  performanceScore: this.computePerformanceScore(metrics),
                  platform: analytics.platform,
                  post: analytics.post,
                  promptUsed: post?.promptUsed,
                  revenue: 0,
                  saves: metrics.saves,
                  shares: metrics.shares,
                  source: PerformanceSource.API,
                  user: analytics.user,
                  views: metrics.views,
                  workflowExecutionId: post?.workflowExecutionId,
                },
              },
              { new: true, upsert: true },
            );

          if (updateResult) {
            result.synced++;

            const resolvedBrandId = analytics.brand?.toString();

            if (resolvedBrandId && post?._id) {
              touchedBrandIds.add(resolvedBrandId);
              try {
                await this.brandMemorySyncService.syncPostPerformance(
                  organizationId,
                  resolvedBrandId,
                  post._id.toString(),
                );
              } catch (syncError) {
                this.logger.error(
                  `Failed to sync brand memory for post ${post._id.toString()}`,
                  syncError,
                );
              }
            }
          }
        } catch (error) {
          result.errors++;
          this.logger.error(
            `Failed to sync analytics for post ${analytics.post}`,
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
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      source: PerformanceSource.API,
    };

    if (brandId) {
      query.brand = new Types.ObjectId(brandId);
    }

    const latest = await this.contentPerformanceModel
      .findOne(query)
      .sort({ measuredAt: -1 })
      .lean()
      .exec();

    return latest?.measuredAt ?? null;
  }
}
