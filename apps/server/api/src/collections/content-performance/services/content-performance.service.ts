import { CreateContentPerformanceDto } from '@api/collections/content-performance/dto/create-content-performance.dto';
import { ImportCsvDto } from '@api/collections/content-performance/dto/import-csv.dto';
import { ImportManualDto } from '@api/collections/content-performance/dto/import-manual.dto';
import { ManualInputDto } from '@api/collections/content-performance/dto/manual-input.dto';
import { QueryContentPerformanceDto } from '@api/collections/content-performance/dto/query-content-performance.dto';
import {
  ContentPerformance,
  type ContentPerformanceDocument,
  PerformanceSource,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ContentType, PostCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PipelineStage } from 'mongoose';

@Injectable()
export class ContentPerformanceService extends BaseService<ContentPerformanceDocument> {
  constructor(
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ContentPerformanceDocument>,
    private readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

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
   * Create a content performance record
   */
  async createPerformance(
    dto: CreateContentPerformanceDto,
    organizationId: string,
    userId: string,
  ): Promise<ContentPerformanceDocument> {
    const data = {
      ...dto,
      brandId: dto.brand,
      engagementRate: dto.engagementRate ?? this.computeEngagementRate(dto),
      measuredAt: new Date(dto.measuredAt),
      organizationId,
      performanceScore:
        dto.performanceScore ?? this.computePerformanceScore(dto),
      postId: dto.post ?? undefined,
      userId,
      workflowExecutionId: dto.workflowExecutionId ?? undefined,
    };

    return this.create(data);
  }

  /**
   * Bulk import from manual CSV/screenshot input
   */
  async bulkManualImport(
    dto: ManualInputDto,
    organizationId: string,
    userId: string,
  ): Promise<ContentPerformanceDocument[]> {
    // M6: Validate brand belongs to org
    if (dto.brand) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brand, isDeleted: false, organizationId },
      });
      if (!brand) {
        throw new BadRequestException(
          'Brand not found or does not belong to this organization',
        );
      }
    }

    const records = dto.entries.map((entry) => ({
      ...entry,
      brandId: dto.brand,
      engagementRate: this.computeEngagementRate(entry),
      measuredAt: new Date(entry.measuredAt),
      organizationId,
      performanceScore: this.computePerformanceScore(entry),
      postId: entry.post ?? undefined,
      source: PerformanceSource.MANUAL,
      userId,
    }));

    return this.model.insertMany(
      records,
    ) as unknown as ContentPerformanceDocument[];
  }

  /**
   * Import CSV-style bulk metrics, matching to existing posts by externalPostId + platform
   */
  async importCsv(
    dto: ImportCsvDto,
    organizationId: string,
    userId: string,
  ): Promise<{
    imported: number;
    matched: number;
    errors: Array<{ index: number; message: string }>;
  }> {
    const errors: Array<{ index: number; message: string }> = [];
    const records: Record<string, unknown>[] = [];
    let matched = 0;

    // Validate brand belongs to org if provided
    let validatedBrandId: string | undefined;
    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, isDeleted: false, organizationId },
      });
      if (!brand) {
        throw new BadRequestException(
          'Brand not found or does not belong to this organization',
        );
      }
      validatedBrandId = dto.brandId;
    }

    // M2: Batch-fetch all matching posts instead of N+1 queries
    const postMatchConditions = dto.entries
      .filter((e) => e.externalPostId && e.platform)
      .map((e) => ({ externalId: e.externalPostId, platform: e.platform }));

    const matchedPosts =
      postMatchConditions.length > 0
        ? await this.prisma.post.findMany({
            where: {
              isDeleted: false,
              organizationId,
              OR: postMatchConditions.map((c) => ({
                externalId: c.externalId,
                platform: c.platform,
              })),
            },
          })
        : [];

    const postLookup = new Map(
      matchedPosts.map((p) => [`${p.externalId}::${p.platform}`, p]),
    );

    for (let i = 0; i < dto.entries.length; i++) {
      const entry = dto.entries[i];

      try {
        const post =
          postLookup.get(`${entry.externalPostId}::${entry.platform}`) ?? null;

        if (post) {
          matched++;
        }

        records.push({
          brandId: post?.brandId ?? validatedBrandId ?? undefined,
          comments: entry.comments ?? 0,
          contentType: this.mapCategoryToContentType(post?.category),
          engagementRate: this.computeEngagementRate(entry),
          externalPostId: entry.externalPostId,
          generationId: post?.generationId ?? undefined,
          likes: entry.likes ?? 0,
          measuredAt: new Date(entry.measuredAt),
          organizationId,
          performanceScore: this.computePerformanceScore(entry),
          platform: entry.platform,
          postId: post?.id ?? undefined,
          revenue: entry.revenue ?? 0,
          saves: entry.saves ?? 0,
          shares: entry.shares ?? 0,
          source: PerformanceSource.CSV,
          userId,
          views: entry.views ?? 0,
        });
      } catch (err) {
        errors.push({
          index: i,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (records.length > 0) {
      await this.model.insertMany(records);
    }

    return { errors, imported: records.length, matched };
  }

  /**
   * Import a single manual metric entry
   */
  async importManual(
    dto: ImportManualDto,
    organizationId: string,
    userId: string,
  ): Promise<ContentPerformanceDocument> {
    let post: Record<string, unknown> | null = null;

    if (dto.postId) {
      post = await this.prisma.post.findFirst({
        where: { id: dto.postId, isDeleted: false, organizationId },
      });
    } else if (dto.externalPostId) {
      post = await this.prisma.post.findFirst({
        where: {
          externalId: dto.externalPostId,
          isDeleted: false,
          organizationId,
          platform: dto.platform,
        },
      });
    }

    const data = {
      brandId: (post?.brandId as string) ?? undefined,
      comments: dto.comments ?? 0,
      contentType: this.mapCategoryToContentType(
        post?.category as string | undefined,
      ),
      engagementRate: this.computeEngagementRate(dto),
      externalPostId: dto.externalPostId,
      generationId: (post?.generationId as string) ?? undefined,
      likes: dto.likes ?? 0,
      measuredAt: new Date(),
      organizationId,
      performanceScore: this.computePerformanceScore(dto),
      platform: dto.platform,
      postId: (post?.id as string) ?? undefined,
      revenue: dto.revenue ?? 0,
      saves: dto.saves ?? 0,
      shares: dto.shares ?? 0,
      source: PerformanceSource.MANUAL,
      userId,
      views: dto.views ?? 0,
    };

    return this.create(data);
  }

  /**
   * Query performance data with filters
   */
  async queryPerformance(
    filters: QueryContentPerformanceDto,
    organizationId: string,
  ): Promise<ContentPerformanceDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (filters.brand) {
      query.brand = filters.brand;
    }
    if (filters.platform) {
      query.platform = filters.platform;
    }
    if (filters.cycleNumber) {
      query.cycleNumber = filters.cycleNumber;
    }
    if (filters.generationId) {
      query.generationId = filters.generationId;
    }
    if (filters.startDate || filters.endDate) {
      query.measuredAt = {};
      if (filters.startDate) {
        (query.measuredAt as Record<string, unknown>).$gte = new Date(
          filters.startDate,
        );
      }
      if (filters.endDate) {
        (query.measuredAt as Record<string, unknown>).$lte = new Date(
          filters.endDate,
        );
      }
    }

    const limit = filters.limit ? Math.min(filters.limit, 500) : 100;
    return this.model.find(query).sort({ measuredAt: -1 }).limit(limit).exec();
  }

  /**
   * Get top performers by performanceScore
   */
  async getTopPerformers(
    organizationId: string,
    brandId?: string,
    limit = 10,
  ): Promise<ContentPerformanceDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (brandId) {
      query.brand = brandId;
    }

    return this.model
      .find(query)
      .sort({ performanceScore: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Aggregate performance by generationId for closed-loop analysis
   */
  async aggregateByGenerationId(
    organizationId: string,
    generationId: string,
  ): Promise<Record<string, unknown>> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          generationId,
          isDeleted: false,
          organization: organizationId,
        },
      },
      {
        $group: {
          _id: '$generationId',
          avgEngagementRate: { $avg: '$engagementRate' },
          avgPerformanceScore: { $avg: '$performanceScore' },
          count: { $sum: 1 },
          totalClicks: { $sum: '$clicks' },
          totalComments: { $sum: '$comments' },
          totalLikes: { $sum: '$likes' },
          totalRevenue: { $sum: '$revenue' },
          totalSaves: { $sum: '$saves' },
          totalShares: { $sum: '$shares' },
          totalViews: { $sum: '$views' },
        },
      },
    ];

    const results = await this.model.aggregate(pipeline).exec();
    return results[0] || {};
  }

  /**
   * Compute a simple performance score (0-100) from metrics
   */
  private computePerformanceScore(
    metrics: Partial<{
      views: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
    }>,
  ): number {
    const {
      views = 0,
      likes = 0,
      comments = 0,
      shares = 0,
      saves = 0,
      clicks = 0,
    } = metrics;
    if (views === 0) {
      return 0;
    }

    const engagementRate =
      ((likes + comments + shares + saves + clicks) / views) * 100;
    // Normalize: 10%+ engagement = 100 score
    return Math.min(100, Math.round(engagementRate * 10));
  }

  /**
   * Compute engagement rate
   */
  private computeEngagementRate(
    metrics: Partial<{
      views: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
    }>,
  ): number {
    const {
      views = 0,
      likes = 0,
      comments = 0,
      shares = 0,
      saves = 0,
    } = metrics;
    if (views === 0) {
      return 0;
    }
    return Number(
      (((likes + comments + shares + saves) / views) * 100).toFixed(2),
    );
  }
}
