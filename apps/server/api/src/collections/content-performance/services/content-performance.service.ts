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
import {
  Post,
  type PostDocument,
} from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ContentType, PostCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type PipelineStage, Types } from 'mongoose';

@Injectable()
export class ContentPerformanceService extends BaseService<ContentPerformanceDocument> {
  constructor(
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ContentPerformanceDocument>,
    @InjectModel(Post.name, DB_CONNECTIONS.CLOUD)
    private readonly postModel: Model<PostDocument>,
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
      brand: new Types.ObjectId(dto.brand),
      engagementRate: dto.engagementRate ?? this.computeEngagementRate(dto),
      measuredAt: new Date(dto.measuredAt),
      organization: new Types.ObjectId(organizationId),
      performanceScore:
        dto.performanceScore ?? this.computePerformanceScore(dto),
      post: dto.post ? new Types.ObjectId(dto.post) : undefined,
      user: new Types.ObjectId(userId),
      workflowExecutionId: dto.workflowExecutionId
        ? new Types.ObjectId(dto.workflowExecutionId)
        : undefined,
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
      const brand = await this.postModel.db.collection('brands').findOne({
        _id: new Types.ObjectId(dto.brand),
        isDeleted: { $ne: true },
        organization: new Types.ObjectId(organizationId),
      });
      if (!brand) {
        throw new BadRequestException(
          'Brand not found or does not belong to this organization',
        );
      }
    }

    const records = dto.entries.map((entry) => ({
      ...entry,
      brand: new Types.ObjectId(dto.brand),
      engagementRate: this.computeEngagementRate(entry),
      measuredAt: new Date(entry.measuredAt),
      organization: new Types.ObjectId(organizationId),
      performanceScore: this.computePerformanceScore(entry),
      post: entry.post ? new Types.ObjectId(entry.post) : undefined,
      source: PerformanceSource.MANUAL,
      user: new Types.ObjectId(userId),
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
    let validatedBrandId: Types.ObjectId | undefined;
    if (dto.brandId) {
      const brand = await this.postModel.db.collection('brands').findOne({
        _id: new Types.ObjectId(dto.brandId),
        isDeleted: { $ne: true },
        organization: new Types.ObjectId(organizationId),
      });
      if (!brand) {
        throw new BadRequestException(
          'Brand not found or does not belong to this organization',
        );
      }
      validatedBrandId = new Types.ObjectId(dto.brandId);
    }

    // M2: Batch-fetch all matching posts instead of N+1 queries
    const postMatchConditions = dto.entries
      .filter((e) => e.externalPostId && e.platform)
      .map((e) => ({ externalId: e.externalPostId, platform: e.platform }));

    const matchedPosts =
      postMatchConditions.length > 0
        ? await this.postModel
            .find({
              $or: postMatchConditions,
              isDeleted: false,
              organization: new Types.ObjectId(organizationId),
            })
            .lean()
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
          brand: post?.brand ?? validatedBrandId ?? undefined,
          comments: entry.comments ?? 0,
          contentType: this.mapCategoryToContentType(post?.category),
          engagementRate: this.computeEngagementRate(entry),
          externalPostId: entry.externalPostId,
          generationId: post?.generationId ?? undefined,
          likes: entry.likes ?? 0,
          measuredAt: new Date(entry.measuredAt),
          organization: new Types.ObjectId(organizationId),
          performanceScore: this.computePerformanceScore(entry),
          platform: entry.platform,
          post: post?._id ?? undefined,
          revenue: entry.revenue ?? 0,
          saves: entry.saves ?? 0,
          shares: entry.shares ?? 0,
          source: PerformanceSource.CSV,
          user: new Types.ObjectId(userId),
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
    let post: PostDocument | null = null;

    if (dto.postId) {
      post = await this.postModel.findOne({
        _id: new Types.ObjectId(dto.postId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });
    } else if (dto.externalPostId) {
      post = await this.postModel.findOne({
        externalId: dto.externalPostId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: dto.platform,
      });
    }

    const data = {
      brand: post?.brand ?? undefined,
      comments: dto.comments ?? 0,
      contentType: this.mapCategoryToContentType(post?.category),
      engagementRate: this.computeEngagementRate(dto),
      externalPostId: dto.externalPostId,
      generationId: post?.generationId ?? undefined,
      likes: dto.likes ?? 0,
      measuredAt: new Date(),
      organization: new Types.ObjectId(organizationId),
      performanceScore: this.computePerformanceScore(dto),
      platform: dto.platform,
      post: post?._id ?? undefined,
      revenue: dto.revenue ?? 0,
      saves: dto.saves ?? 0,
      shares: dto.shares ?? 0,
      source: PerformanceSource.MANUAL,
      user: new Types.ObjectId(userId),
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
      organization: new Types.ObjectId(organizationId),
    };

    if (filters.brand) {
      query.brand = new Types.ObjectId(filters.brand);
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
      organization: new Types.ObjectId(organizationId),
    };

    if (brandId) {
      query.brand = new Types.ObjectId(brandId);
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
          organization: new Types.ObjectId(organizationId),
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
