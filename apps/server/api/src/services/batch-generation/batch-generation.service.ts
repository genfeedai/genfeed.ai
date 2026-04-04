import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import {
  PostAnalytics,
  type PostAnalyticsDocument,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type { ReviewBatchItemFormat } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import {
  Batch,
  type BatchDocument,
  type ContentMixConfig,
} from '@api/services/batch-generation/schemas/batch.schema';
import type { IBatchSummary } from '@genfeedai/interfaces';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

interface BatchItem {
  format: ContentFormat;
  status: BatchItemStatus;
  platform?: string;
  scheduledDate?: Date;
}

interface ManualReviewBatchItem {
  caption?: string;
  format: ReviewBatchItemFormat;
  gateOverallScore?: number;
  gateReasons: string[];
  mediaUrl?: string;
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
  platform?: string;
  postId?: Types.ObjectId;
  prompt?: string;
  reviewEvents: Array<{
    decision: 'approved' | 'rejected' | 'request_changes';
    feedback?: string;
    reviewedAt: Date;
  }>;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  status: BatchItemStatus;
}

interface BatchProcessItemContext {
  batchId: string;
  completedCount: number;
  error?: string;
  failedCount: number;
  index: number;
  item: BatchDocument['items'][number];
  postId?: string;
  previewText?: string;
  topic: string;
  totalCount: number;
}

interface BatchProcessOptions {
  onBatchCompleted?: (params: {
    batchId: string;
    completedCount: number;
    failedCount: number;
    status: BatchStatus;
    totalCount: number;
  }) => Promise<void> | void;
  onBatchStarted?: (params: {
    batchId: string;
    totalCount: number;
  }) => Promise<void> | void;
  onItemCompleted?: (params: BatchProcessItemContext) => Promise<void> | void;
  onItemFailed?: (params: BatchProcessItemContext) => Promise<void> | void;
  onItemStarted?: (params: BatchProcessItemContext) => Promise<void> | void;
}

export interface ReviewInboxItemSummary {
  batchId: string;
  createdAt: string;
  format: string;
  id: string;
  mediaUrl?: string;
  platform?: string;
  postId?: string;
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  status: string;
  summary: string;
}

export interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: ReviewInboxItemSummary[];
  rejectedCount: number;
}

@Injectable()
export class BatchGenerationService {
  constructor(
    @InjectModel(Batch.name, DB_CONNECTIONS.CLOUD)
    private readonly batchModel: Model<BatchDocument>,
    @InjectModel(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS)
    private readonly postAnalyticsModel: Model<PostAnalyticsDocument>,
    private readonly logger: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly postsService: PostsService,
    private readonly contentGeneratorService: ContentGeneratorService,
  ) {}

  @HandleErrors('create batch', 'batch-generation')
  async createBatch(
    dto: CreateBatchDto,
    userId: string,
    orgId: string,
  ): Promise<IBatchSummary> {
    const orgObjectId = new Types.ObjectId(orgId);
    const userObjectId = new Types.ObjectId(userId);
    const brandObjectId = new Types.ObjectId(dto.brandId);

    // Verify brand exists and belongs to org
    const brand = await this.brandsService.findOne({
      _id: brandObjectId,
      isDeleted: false,
      organization: orgObjectId,
    });

    if (!brand) {
      throw new NotFoundException(`Brand ${dto.brandId} not found`);
    }

    const contentMix: ContentMixConfig = dto.contentMix ?? {
      carouselPercent: 10,
      imagePercent: 60,
      reelPercent: 5,
      storyPercent: 0,
      videoPercent: 25,
    };

    const dateRangeStart = new Date(dto.dateRange.start);
    const dateRangeEnd = new Date(dto.dateRange.end);

    const items = this.generateContentPlan(
      dto.count,
      contentMix,
      dto.platforms,
      dto.topics ?? [],
      dateRangeStart,
      dateRangeEnd,
    );

    const batch = await this.batchModel.create({
      brand: brandObjectId,
      completedCount: 0,
      contentMix,
      dateRangeEnd,
      dateRangeStart,
      failedCount: 0,
      isDeleted: false,
      items,
      organization: orgObjectId,
      platforms: dto.platforms,
      status: BatchStatus.PENDING,
      style: dto.style,
      topics: dto.topics ?? [],
      totalCount: dto.count,
      user: userObjectId,
    });

    this.logger.log(`Batch created: ${batch._id}`, {
      batchId: batch._id.toString(),
      count: dto.count,
      orgId,
    });

    return this.toBatchSummary(batch);
  }

  @HandleErrors('create manual review batch', 'batch-generation')
  async createManualReviewBatch(
    dto: CreateManualReviewBatchDto,
    userId: string,
    orgId: string,
  ): Promise<IBatchSummary> {
    const orgObjectId = new Types.ObjectId(orgId);
    const userObjectId = new Types.ObjectId(userId);
    const brandObjectId = new Types.ObjectId(dto.brandId);

    const brand = await this.brandsService.findOne({
      _id: brandObjectId,
      isDeleted: false,
      organization: orgObjectId,
    });

    if (!brand) {
      throw new NotFoundException(`Brand ${dto.brandId} not found`);
    }

    const items: ManualReviewBatchItem[] = [];

    for (const reviewItem of dto.items) {
      const ingredientIds = reviewItem.ingredientId
        ? [new Types.ObjectId(reviewItem.ingredientId)]
        : [];
      const post = await this.postsService.create({
        brand: brandObjectId,
        description:
          reviewItem.caption ??
          reviewItem.prompt ??
          'Review this asset before publishing',
        ingredients: ingredientIds,
        label: reviewItem.label ?? `Review ${reviewItem.format} draft`,
        organization: orgObjectId,
        platform: reviewItem.platform as never,
        promptUsed: reviewItem.prompt,
        sourceActionId: reviewItem.sourceActionId,
        sourceWorkflowId: reviewItem.sourceWorkflowId,
        sourceWorkflowName: reviewItem.sourceWorkflowName,
        status: PostStatus.DRAFT,
        user: userObjectId,
      } as never);

      items.push({
        caption: reviewItem.caption,
        format: reviewItem.format,
        gateOverallScore: reviewItem.gateOverallScore,
        gateReasons: reviewItem.gateReasons ?? [],
        mediaUrl: reviewItem.mediaUrl,
        opportunitySourceType: reviewItem.opportunitySourceType,
        opportunityTopic: reviewItem.opportunityTopic,
        platform: reviewItem.platform,
        postId: post._id as Types.ObjectId,
        prompt: reviewItem.prompt,
        reviewEvents: [],
        sourceActionId: reviewItem.sourceActionId,
        sourceWorkflowId: reviewItem.sourceWorkflowId,
        sourceWorkflowName: reviewItem.sourceWorkflowName,
        status: BatchItemStatus.COMPLETED,
      });
    }

    const batch: BatchDocument = await this.batchModel.create({
      brand: brandObjectId,
      completedAt: new Date(),
      completedCount: items.length,
      contentMix: {
        carouselPercent: 0,
        imagePercent: 0,
        reelPercent: 0,
        storyPercent: 0,
        videoPercent: 0,
      },
      failedCount: 0,
      isDeleted: false,
      items,
      organization: orgObjectId,
      platforms: Array.from(
        new Set(
          dto.items.flatMap((item) => (item.platform ? [item.platform] : [])),
        ),
      ),
      source: 'manual',
      status: BatchStatus.COMPLETED,
      topics: [],
      totalCount: items.length,
      user: userObjectId,
    });

    this.logger.log(`Manual review batch created: ${batch._id}`, {
      batchId: batch._id.toString(),
      itemCount: items.length,
      orgId,
    });

    await Promise.all(
      batch.items.map((item, index) => {
        const postId = items[index]?.postId;
        if (!postId) {
          return Promise.resolve();
        }

        return this.batchModel.db.model('Post').updateOne(
          {
            _id: postId,
            isDeleted: false,
            organization: orgObjectId,
          },
          {
            $set: {
              reviewBatchId: batch._id.toString(),
              reviewItemId: item._id.toString(),
            },
          },
        );
      }),
    );

    return this.toBatchSummary(batch);
  }

  @HandleErrors('get review inbox summary', 'batch-generation')
  async getReviewInboxSummary(
    orgId: string,
    brandId?: string,
    limit = 5,
  ): Promise<ReviewInboxSummary> {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    };

    if (brandId && Types.ObjectId.isValid(brandId)) {
      match.brand = new Types.ObjectId(brandId);
    }

    const [summaryRows, recentRows] = await Promise.all([
      this.batchModel
        .aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: null,
              approvedCount: {
                $sum: {
                  $cond: [{ $eq: ['$items.reviewDecision', 'approved'] }, 1, 0],
                },
              },
              changesRequestedCount: {
                $sum: {
                  $cond: [
                    { $eq: ['$items.reviewDecision', 'request_changes'] },
                    1,
                    0,
                  ],
                },
              },
              pendingCount: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        '$items.status',
                        [BatchItemStatus.GENERATING, BatchItemStatus.PENDING],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              readyCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$items.status', BatchItemStatus.COMPLETED] },
                        {
                          $eq: [
                            { $ifNull: ['$items.reviewDecision', null] },
                            null,
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              rejectedCount: {
                $sum: {
                  $cond: [{ $eq: ['$items.reviewDecision', 'rejected'] }, 1, 0],
                },
              },
            },
          },
        ])
        .exec(),
      this.batchModel
        .aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $project: {
              batchId: { $toString: '$_id' },
              createdAt: {
                $ifNull: ['$items.createdAt', '$createdAt'],
              },
              format: '$items.format',
              id: { $toString: '$items._id' },
              mediaUrl: '$items.mediaUrl',
              platform: '$items.platform',
              postId: {
                $cond: [
                  { $ifNull: ['$items.postId', false] },
                  { $toString: '$items.postId' },
                  null,
                ],
              },
              reviewDecision: '$items.reviewDecision',
              status: '$items.status',
              summary: {
                $ifNull: [
                  '$items.caption',
                  {
                    $ifNull: [
                      '$items.prompt',
                      {
                        $concat: [
                          { $toUpper: { $substrCP: ['$items.format', 0, 1] } },
                          {
                            $substrCP: [
                              '$items.format',
                              1,
                              { $strLenCP: '$items.format' },
                            ],
                          },
                          ' ready for review',
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          {
            $match: {
              reviewDecision: null,
              status: BatchItemStatus.COMPLETED,
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: Math.max(1, Math.min(limit, 10)) },
        ])
        .exec(),
    ]);

    const summary = summaryRows[0] as
      | Omit<ReviewInboxSummary, 'recentItems'>
      | undefined;

    return {
      approvedCount: summary?.approvedCount ?? 0,
      changesRequestedCount: summary?.changesRequestedCount ?? 0,
      pendingCount: summary?.pendingCount ?? 0,
      readyCount: summary?.readyCount ?? 0,
      recentItems: (recentRows as Array<Record<string, unknown>>).map(
        (row) => ({
          batchId: String(row.batchId),
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : String(row.createdAt),
          format: String(row.format),
          id: String(row.id),
          mediaUrl: typeof row.mediaUrl === 'string' ? row.mediaUrl : undefined,
          platform: typeof row.platform === 'string' ? row.platform : undefined,
          postId: typeof row.postId === 'string' ? row.postId : undefined,
          reviewDecision:
            row.reviewDecision === 'approved' ||
            row.reviewDecision === 'rejected' ||
            row.reviewDecision === 'request_changes'
              ? row.reviewDecision
              : undefined,
          status: String(row.status),
          summary: String(row.summary),
        }),
      ),
      rejectedCount: summary?.rejectedCount ?? 0,
    };
  }

  @HandleErrors('process batch', 'batch-generation')
  async processBatch(
    batchId: string,
    orgId: string,
    options?: BatchProcessOptions,
  ): Promise<IBatchSummary> {
    const orgObjectId = new Types.ObjectId(orgId);

    const batch = await this.batchModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
      organization: orgObjectId,
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    batch.status = BatchStatus.GENERATING;
    await batch.save();

    await options?.onBatchStarted?.({
      batchId,
      totalCount: batch.totalCount,
    });

    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];

      if (item.status !== BatchItemStatus.PENDING) {
        continue;
      }

      try {
        item.status = BatchItemStatus.GENERATING;

        // Generate content (prompt + caption) using ContentGeneratorService
        const topic =
          batch.topics.length > 0
            ? batch.topics[i % batch.topics.length]
            : `${item.format} content`;

        await options?.onItemStarted?.({
          batchId,
          completedCount,
          failedCount,
          index: i,
          item,
          topic,
          totalCount: batch.totalCount,
        });

        const generated = await this.contentGeneratorService.generateContent(
          batch.organization,
          {
            additionalContext: batch.style ? [batch.style] : undefined,
            platform: item.platform as never,
            topic,
            variationsCount: 1,
          },
        );

        const content = generated[0];
        item.prompt = content?.content ?? topic;
        item.caption = content?.content ?? '';

        // Create a draft post as placeholder
        const post = await this.postsService.create({
          brand: batch.brand,
          credential: undefined as never,
          description: item.caption,
          ingredients: [],
          label: `Batch: ${topic}`,
          organization: batch.organization,
          platform: item.platform as never,
          scheduledDate: item.scheduledDate,
          status: PostStatus.DRAFT,
          user: batch.user,
        } as never);

        item.postId = post._id as Types.ObjectId;
        item.status = BatchItemStatus.COMPLETED;
        completedCount++;

        await options?.onItemCompleted?.({
          batchId,
          completedCount,
          failedCount,
          index: i,
          item,
          postId: post._id?.toString?.(),
          previewText: item.caption,
          topic,
          totalCount: batch.totalCount,
        });
      } catch (error: unknown) {
        item.status = BatchItemStatus.FAILED;
        item.error = error instanceof Error ? error.message : 'Unknown error';
        failedCount++;

        this.logger.error(`Batch item ${item._id} failed: ${item.error}`, {
          batchId,
          itemId: item._id,
        });

        await options?.onItemFailed?.({
          batchId,
          completedCount,
          error: item.error,
          failedCount,
          index: i,
          item,
          topic:
            batch.topics.length > 0
              ? batch.topics[i % batch.topics.length]
              : `${item.format} content`,
          totalCount: batch.totalCount,
        });
      }
    }

    batch.completedCount = completedCount;
    batch.failedCount = failedCount;

    if (failedCount === 0 && completedCount === batch.totalCount) {
      batch.status = BatchStatus.COMPLETED;
      batch.completedAt = new Date();
    } else if (completedCount > 0) {
      batch.status = BatchStatus.PARTIAL;
    } else {
      batch.status = BatchStatus.FAILED;
    }

    await batch.save();

    this.logger.log(`Batch processing complete: ${batchId}`, {
      batchId,
      completedCount,
      failedCount,
      status: batch.status,
    });

    await options?.onBatchCompleted?.({
      batchId,
      completedCount,
      failedCount,
      status: batch.status,
      totalCount: batch.totalCount,
    });

    return this.toBatchSummary(batch);
  }

  @HandleErrors('get batch', 'batch-generation')
  async getBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batch = await this.batchModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    return this.toBatchSummary(batch);
  }

  @HandleErrors('get batches', 'batch-generation')
  async getBatches(
    orgId: string,
    query?: { status?: BatchStatus; limit?: number; offset?: number },
  ): Promise<{ items: IBatchSummary[]; total: number }> {
    const filter: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    };

    if (query?.status) {
      filter.status = query.status;
    }

    const limit = Math.min(query?.limit ?? 20, 100);
    const offset = query?.offset ?? 0;

    const [batches, total] = await Promise.all([
      this.batchModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.batchModel.countDocuments(filter),
    ]);

    return {
      items: await Promise.all(batches.map((b) => this.toBatchSummary(b))),
      total,
    };
  }

  @HandleErrors('approve items', 'batch-generation')
  async approveItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
  ): Promise<IBatchSummary> {
    const batch = await this.batchModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const itemIdSet = new Set(itemIds);
    const postIdsToSchedule: Types.ObjectId[] = [];
    const postIdsToUpdate: Types.ObjectId[] = [];
    const reviewedAt = new Date();

    for (const item of batch.items) {
      if (
        itemIdSet.has(item._id.toString()) &&
        item.status === BatchItemStatus.COMPLETED
      ) {
        item.reviewDecision = 'approved';
        item.reviewFeedback = undefined;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          { decision: 'approved', reviewedAt },
        ];
        if (item.postId) {
          postIdsToUpdate.push(item.postId);
        }
        if (item.postId && item.scheduledDate) {
          postIdsToSchedule.push(item.postId);
        }
      }
    }

    if (postIdsToUpdate.length > 0) {
      await this.batchModel.db.model('Post').updateMany(
        {
          _id: { $in: postIdsToUpdate },
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        {
          $push: {
            reviewEvents: { decision: 'approved', reviewedAt },
          },
          $set: {
            reviewDecision: 'approved',
            reviewedAt,
            reviewFeedback: undefined,
          },
        },
      );
    }

    // Update associated posts to SCHEDULED status
    if (postIdsToSchedule.length > 0) {
      await this.batchModel.db.model('Post').updateMany(
        {
          _id: { $in: postIdsToSchedule },
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        { $set: { status: PostStatus.SCHEDULED } },
      );
    }

    await batch.save();

    this.logger.log(`Approved ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.toBatchSummary(batch);
  }

  @HandleErrors('reject items', 'batch-generation')
  async rejectItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
  ): Promise<IBatchSummary> {
    const batch = await this.batchModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const itemIdSet = new Set(itemIds);
    const postIdsToReject: Types.ObjectId[] = [];
    const reviewedAt = new Date();

    for (const item of batch.items) {
      if (itemIdSet.has(item._id.toString())) {
        item.status = BatchItemStatus.SKIPPED;
        item.reviewDecision = 'rejected';
        item.reviewFeedback = feedback;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          { decision: 'rejected', feedback, reviewedAt },
        ];
        if (item.postId) {
          postIdsToReject.push(item.postId);
        }
      }
    }

    // Soft-delete rejected posts
    if (postIdsToReject.length > 0) {
      await this.batchModel.db.model('Post').updateMany(
        {
          _id: { $in: postIdsToReject },
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        {
          $push: {
            reviewEvents: { decision: 'rejected', feedback, reviewedAt },
          },
          $set: {
            isDeleted: true,
            reviewDecision: 'rejected',
            reviewedAt,
            reviewFeedback: feedback,
          },
        },
      );
    }

    await batch.save();

    this.logger.log(`Rejected ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.toBatchSummary(batch);
  }

  @HandleErrors('request changes', 'batch-generation')
  async requestChanges(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
  ): Promise<IBatchSummary> {
    const batch = await this.batchModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const itemIdSet = new Set(itemIds);
    const postIdsToKeepAsDraft: Types.ObjectId[] = [];
    const reviewedAt = new Date();

    for (const item of batch.items) {
      if (
        itemIdSet.has(item._id.toString()) &&
        item.status === BatchItemStatus.COMPLETED
      ) {
        item.reviewDecision = 'request_changes';
        item.reviewFeedback = feedback;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          { decision: 'request_changes', feedback, reviewedAt },
        ];
        if (item.postId) {
          postIdsToKeepAsDraft.push(item.postId);
        }
      }
    }

    if (postIdsToKeepAsDraft.length > 0) {
      await this.batchModel.db.model('Post').updateMany(
        {
          _id: { $in: postIdsToKeepAsDraft },
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        {
          $push: {
            reviewEvents: { decision: 'request_changes', feedback, reviewedAt },
          },
          $set: {
            reviewDecision: 'request_changes',
            reviewedAt,
            reviewFeedback: feedback,
            status: PostStatus.DRAFT,
          },
        },
      );
    }

    await batch.save();

    this.logger.log(
      `Requested changes for ${itemIds.length} items in batch ${batchId}`,
      {
        batchId,
        itemCount: itemIds.length,
      },
    );

    return this.toBatchSummary(batch);
  }

  @HandleErrors('cancel batch', 'batch-generation')
  async cancelBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batch = await this.batchModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    for (const item of batch.items) {
      if (item.status === BatchItemStatus.PENDING) {
        item.status = BatchItemStatus.SKIPPED;
      }
    }

    batch.status = BatchStatus.CANCELLED;
    await batch.save();

    this.logger.log(`Batch cancelled: ${batchId}`, { batchId });

    return this.toBatchSummary(batch);
  }

  private generateContentPlan(
    count: number,
    contentMix: ContentMixConfig,
    platforms: string[],
    _topics: string[],
    dateRangeStart: Date,
    dateRangeEnd: Date,
  ): BatchItem[] {
    const items: BatchItem[] = [];
    const formatCounts = this.calculateFormatCounts(count, contentMix);
    const timeSlots = this.distributeTimeSlots(
      count,
      dateRangeStart,
      dateRangeEnd,
    );

    let index = 0;
    for (const [format, formatCount] of Object.entries(formatCounts)) {
      for (let i = 0; i < formatCount; i++) {
        items.push({
          format: format as ContentFormat,
          platform: platforms[index % platforms.length],
          scheduledDate: timeSlots[index],
          status: BatchItemStatus.PENDING,
        });
        index++;
      }
    }

    return items;
  }

  private calculateFormatCounts(
    total: number,
    contentMix: ContentMixConfig,
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    let remaining = total;

    const formats: Array<{ key: ContentFormat; percent: number }> = [
      { key: ContentFormat.IMAGE, percent: contentMix.imagePercent },
      { key: ContentFormat.VIDEO, percent: contentMix.videoPercent },
      { key: ContentFormat.CAROUSEL, percent: contentMix.carouselPercent },
      { key: ContentFormat.REEL, percent: contentMix.reelPercent },
      { key: ContentFormat.STORY, percent: contentMix.storyPercent },
    ];

    // Calculate counts based on percentages
    for (const format of formats) {
      const count = Math.round((format.percent / 100) * total);
      counts[format.key] = count;
      remaining -= count;
    }

    // Distribute any remaining items to the largest format
    if (remaining !== 0) {
      const largest = formats.reduce((a, b) =>
        a.percent >= b.percent ? a : b,
      );
      counts[largest.key] = (counts[largest.key] ?? 0) + remaining;
    }

    return counts;
  }

  private distributeTimeSlots(count: number, start: Date, end: Date): Date[] {
    const slots: Date[] = [];
    const totalMs = end.getTime() - start.getTime();
    const interval = count > 1 ? totalMs / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      slots.push(new Date(start.getTime() + interval * i));
    }

    return slots;
  }

  private async toBatchSummary(batch: BatchDocument): Promise<IBatchSummary> {
    const pendingCount = batch.items.filter(
      (item) =>
        item.status === BatchItemStatus.PENDING ||
        item.status === BatchItemStatus.GENERATING,
    ).length;
    const batchId = batch._id.toString();
    const postIds = batch.items
      .map((item) => item.postId)
      .filter((item): item is Types.ObjectId => item != null);
    const linkedPosts =
      postIds.length > 0
        ? await this.batchModel.db.model('Post').find(
            {
              _id: { $in: postIds },
              isDeleted: false,
              organization: batch.organization,
            },
            {
              _id: 1,
              externalId: 1,
              generationId: 1,
              lastAttemptAt: 1,
              promptUsed: 1,
              publishedAt: 1,
              retryCount: 1,
              reviewDecision: 1,
              reviewedAt: 1,
              reviewFeedback: 1,
              status: 1,
              url: 1,
            },
          )
        : [];
    const linkedAnalytics =
      postIds.length > 0
        ? await this.postAnalyticsModel
            .aggregate([
              {
                $match: {
                  organization: batch.organization,
                  post: { $in: postIds },
                },
              },
              {
                $group: {
                  _id: '$post',
                  avgEngagementRate: { $avg: '$engagementRate' },
                  totalComments: { $max: '$totalComments' },
                  totalLikes: { $max: '$totalLikes' },
                  totalSaves: { $max: '$totalSaves' },
                  totalShares: { $max: '$totalShares' },
                  totalViews: { $max: '$totalViews' },
                },
              },
            ])
            .exec()
        : [];
    const linkedPostMap = new Map(
      linkedPosts.map((post: Record<string, unknown>) => [
        String(post._id),
        post,
      ]),
    );
    const linkedAnalyticsMap = new Map(
      linkedAnalytics.map((analytics: Record<string, unknown>) => [
        String(analytics._id),
        analytics,
      ]),
    );

    return {
      brandId: batch.brand.toString(),
      completedAt: batch.completedAt?.toISOString(),
      completedCount: batch.completedCount,
      contentMix: {
        carouselPercent: batch.contentMix?.carouselPercent ?? 10,
        imagePercent: batch.contentMix?.imagePercent ?? 60,
        reelPercent: batch.contentMix?.reelPercent ?? 5,
        storyPercent: batch.contentMix?.storyPercent ?? 0,
        videoPercent: batch.contentMix?.videoPercent ?? 25,
      },
      createdAt:
        (batch as unknown as { createdAt: Date }).createdAt?.toISOString() ??
        new Date().toISOString(),
      failedCount: batch.failedCount,
      id: batchId,
      items: batch.items.map((item) => {
        const postId = item.postId?.toString();
        const linkedPost = postId ? linkedPostMap.get(postId) : undefined;
        const analytics = postId ? linkedAnalyticsMap.get(postId) : undefined;

        return {
          batchId,
          caption: item.caption,
          createdAt:
            (item as unknown as { createdAt: Date }).createdAt?.toISOString() ??
            new Date().toISOString(),
          error: item.error,
          format: item.format,
          gateOverallScore: item.gateOverallScore,
          gateReasons: item.gateReasons ?? [],
          id: item._id.toString(),
          mediaUrl: item.mediaUrl,
          opportunitySourceType: item.opportunitySourceType,
          opportunityTopic: item.opportunityTopic,
          platform: item.platform,
          postAvgEngagementRate:
            typeof analytics?.avgEngagementRate === 'number'
              ? analytics.avgEngagementRate
              : undefined,
          postExternalId:
            typeof linkedPost?.externalId === 'string'
              ? linkedPost.externalId
              : undefined,
          postGenerationId:
            typeof linkedPost?.generationId === 'string'
              ? linkedPost.generationId
              : undefined,
          postId,
          postLastAttemptAt:
            linkedPost?.lastAttemptAt instanceof Date
              ? linkedPost.lastAttemptAt.toISOString()
              : undefined,
          postPromptUsed:
            typeof linkedPost?.promptUsed === 'string'
              ? linkedPost.promptUsed
              : undefined,
          postPublishedAt:
            linkedPost?.publishedAt instanceof Date
              ? linkedPost.publishedAt.toISOString()
              : undefined,
          postRetryCount:
            typeof linkedPost?.retryCount === 'number'
              ? linkedPost.retryCount
              : undefined,
          postStatus:
            typeof linkedPost?.status === 'string'
              ? linkedPost.status
              : undefined,
          postTotalComments:
            typeof analytics?.totalComments === 'number'
              ? analytics.totalComments
              : undefined,
          postTotalLikes:
            typeof analytics?.totalLikes === 'number'
              ? analytics.totalLikes
              : undefined,
          postTotalSaves:
            typeof analytics?.totalSaves === 'number'
              ? analytics.totalSaves
              : undefined,
          postTotalShares:
            typeof analytics?.totalShares === 'number'
              ? analytics.totalShares
              : undefined,
          postTotalViews:
            typeof analytics?.totalViews === 'number'
              ? analytics.totalViews
              : undefined,
          postUrl:
            typeof linkedPost?.url === 'string' ? linkedPost.url : undefined,
          prompt: item.prompt,
          reviewDecision: item.reviewDecision,
          reviewEvents: (item.reviewEvents ?? []).map((event) => ({
            decision: event.decision,
            feedback: event.feedback,
            reviewedAt: event.reviewedAt.toISOString(),
          })),
          reviewedAt: item.reviewedAt?.toISOString(),
          reviewFeedback: item.reviewFeedback,
          scheduledDate: item.scheduledDate?.toISOString(),
          sourceActionId: item.sourceActionId,
          sourceWorkflowId: item.sourceWorkflowId,
          sourceWorkflowName: item.sourceWorkflowName,
          status: item.status,
        };
      }),
      pendingCount,
      platforms: batch.platforms,
      status: batch.status,
      totalCount: batch.totalCount,
    };
  }
}
