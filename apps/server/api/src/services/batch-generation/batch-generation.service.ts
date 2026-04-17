import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ReviewBatchItemFormat } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import type { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PostStatus,
} from '@genfeedai/enums';
import type {
  IBatchSummary,
  ManualReviewBatchItem,
} from '@genfeedai/interfaces';
import type { Batch } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

interface BatchItem {
  format: ContentFormat;
  status: BatchItemStatus;
  platform?: string;
  scheduledDate?: string;
}

interface BatchItemFull extends BatchItem {
  _id: string;
  caption?: string;
  prompt?: string;
  postId?: string;
  mediaUrl?: string;
  error?: string;
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewEvents?: Array<{
    decision: 'approved' | 'rejected' | 'request_changes';
    feedback?: string;
    reviewedAt: string;
  }>;
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
  creativeVersion?: string;
  hookVersion?: string;
  contentRunId?: string;
  variantId?: string;
  scheduleSlot?: string;
  publishIntent?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  createdAt?: string;
}

type BatchConfig = {
  contentMix?: ContentMixConfig;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  platforms?: string[];
  topics?: string[];
  completedCount?: number;
  failedCount?: number;
  totalCount?: number;
  completedAt?: string;
  source?: string;
  style?: string;
};

type BatchWithConfig = Batch & {
  config: BatchConfig;
  items: BatchItemFull[];
};

interface BatchProcessItemContext {
  batchId: string;
  completedCount: number;
  error?: string;
  failedCount: number;
  index: number;
  item: BatchItemFull;
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
    private readonly prisma: PrismaService,
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
    // Verify brand exists and belongs to org
    const brand = await this.brandsService.findOne({
      _id: dto.brandId,
      isDeleted: false,
      organization: orgId,
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

    const config: BatchConfig = {
      completedCount: 0,
      contentMix,
      dateRangeEnd: dateRangeEnd.toISOString(),
      dateRangeStart: dateRangeStart.toISOString(),
      failedCount: 0,
      platforms: dto.platforms,
      style: dto.style,
      topics: dto.topics ?? [],
      totalCount: dto.count,
    };

    const batch = (await this.prisma.batch.create({
      data: {
        brandId: dto.brandId,
        config: config as never,
        isDeleted: false,
        items: items as never,
        organizationId: orgId,
        status: BatchStatus.PENDING as never,
        userId,
      },
    })) as BatchWithConfig;

    this.logger.log(`Batch created: ${batch.id}`, {
      batchId: batch.id,
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
    const brand = await this.brandsService.findOne({
      _id: dto.brandId,
      isDeleted: false,
      organization: orgId,
    });

    if (!brand) {
      throw new NotFoundException(`Brand ${dto.brandId} not found`);
    }

    const items: ManualReviewBatchItem[] = [];
    const batchItems: BatchItemFull[] = [];

    for (const reviewItem of dto.items) {
      const contentRunId = reviewItem.contentRunId
        ? String(reviewItem.contentRunId)
        : undefined;
      const post = await this.postsService.create({
        brand: dto.brandId,
        contentRunId,
        creativeVersion: reviewItem.creativeVersion,
        description:
          reviewItem.caption ??
          reviewItem.prompt ??
          'Review this asset before publishing',
        hookVersion: reviewItem.hookVersion,
        ingredients: reviewItem.ingredientId ? [reviewItem.ingredientId] : [],
        label: reviewItem.label ?? `Review ${reviewItem.format} draft`,
        organization: orgId,
        platform: reviewItem.platform as never,
        publishIntent: reviewItem.publishIntent,
        promptUsed: reviewItem.prompt,
        scheduleSlot: reviewItem.scheduleSlot,
        sourceActionId: reviewItem.sourceActionId,
        sourceWorkflowId: reviewItem.sourceWorkflowId,
        sourceWorkflowName: reviewItem.sourceWorkflowName,
        status: PostStatus.DRAFT,
        user: userId,
        variantId: reviewItem.variantId,
      } as never);

      const postId = String((post as Record<string, unknown>)._id ?? post.id);

      batchItems.push({
        _id: crypto.randomUUID(),
        caption: reviewItem.caption,
        contentRunId,
        creativeVersion: reviewItem.creativeVersion,
        format: reviewItem.format as ContentFormat,
        gateOverallScore: reviewItem.gateOverallScore,
        gateReasons: reviewItem.gateReasons ?? [],
        hookVersion: reviewItem.hookVersion,
        mediaUrl: reviewItem.mediaUrl,
        opportunitySourceType: reviewItem.opportunitySourceType,
        opportunityTopic: reviewItem.opportunityTopic,
        platform: reviewItem.platform,
        postId,
        publishIntent: reviewItem.publishIntent,
        prompt: reviewItem.prompt,
        reviewEvents: [],
        scheduleSlot: reviewItem.scheduleSlot,
        sourceActionId: reviewItem.sourceActionId,
        sourceWorkflowId: reviewItem.sourceWorkflowId,
        sourceWorkflowName: reviewItem.sourceWorkflowName,
        status: BatchItemStatus.COMPLETED,
        variantId: reviewItem.variantId,
      });
    }

    const config: BatchConfig = {
      completedAt: new Date().toISOString(),
      completedCount: batchItems.length,
      contentMix: {
        carouselPercent: 0,
        imagePercent: 0,
        reelPercent: 0,
        storyPercent: 0,
        videoPercent: 0,
      },
      failedCount: 0,
      platforms: Array.from(
        new Set(
          dto.items.flatMap((item) => (item.platform ? [item.platform] : [])),
        ),
      ),
      source: 'manual',
      topics: [],
      totalCount: batchItems.length,
    };

    const batch = (await this.prisma.batch.create({
      data: {
        brandId: dto.brandId,
        config: config as never,
        isDeleted: false,
        items: batchItems as never,
        organizationId: orgId,
        status: BatchStatus.COMPLETED as never,
        userId,
      },
    })) as BatchWithConfig;

    this.logger.log(`Manual review batch created: ${batch.id}`, {
      batchId: batch.id,
      itemCount: batchItems.length,
      orgId,
    });

    // Update posts with reviewBatchId / reviewItemId
    await Promise.all(
      batchItems.map(async (item) => {
        if (!item.postId) return;

        await this.prisma.post.updateMany({
          data: {
            reviewBatchId: batch.id,
            reviewItemId: item._id,
          },
          where: {
            id: item.postId,
            isDeleted: false,
            organizationId: orgId,
          },
        });
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
    const batches = (await this.prisma.batch.findMany({
      where: {
        isDeleted: false,
        organizationId: orgId,
        ...(brandId ? { brandId } : {}),
      },
    })) as BatchWithConfig[];

    let approvedCount = 0;
    let rejectedCount = 0;
    let changesRequestedCount = 0;
    let pendingCount = 0;
    let readyCount = 0;
    const readyItems: ReviewInboxItemSummary[] = [];

    for (const batch of batches) {
      const batchItems = (batch.items as BatchItemFull[]) ?? [];
      for (const item of batchItems) {
        const decision = item.reviewDecision;
        const status = item.status;

        if (decision === 'approved') {
          approvedCount++;
        } else if (decision === 'rejected') {
          rejectedCount++;
        } else if (decision === 'request_changes') {
          changesRequestedCount++;
        } else if (
          status === BatchItemStatus.GENERATING ||
          status === BatchItemStatus.PENDING
        ) {
          pendingCount++;
        } else if (status === BatchItemStatus.COMPLETED && !decision) {
          readyCount++;
          readyItems.push({
            batchId: batch.id,
            createdAt: item.createdAt ?? batch.createdAt.toISOString(),
            format: item.format,
            id: item._id,
            mediaUrl: item.mediaUrl,
            platform: item.platform,
            postId: item.postId,
            reviewDecision: undefined,
            status: item.status,
            summary:
              item.caption ??
              item.prompt ??
              `${item.format.charAt(0).toUpperCase()}${item.format.slice(1)} ready for review`,
          });
        }
      }
    }

    // Sort ready items by createdAt desc, take limit
    readyItems.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const recentItems = readyItems.slice(0, Math.max(1, Math.min(limit, 10)));

    return {
      approvedCount,
      changesRequestedCount,
      pendingCount,
      readyCount,
      recentItems,
      rejectedCount,
    };
  }

  @HandleErrors('process batch', 'batch-generation')
  async processBatch(
    batchId: string,
    orgId: string,
    options?: BatchProcessOptions,
  ): Promise<IBatchSummary> {
    const batchRecord = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });

    if (!batchRecord) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const batchConfig = (batchRecord.config ?? {}) as BatchConfig;
    const batchItems = ((batchRecord.items ?? []) as BatchItemFull[]).map(
      (item) => ({ ...item }),
    );

    // Mark as generating
    await this.prisma.batch.update({
      data: { status: BatchStatus.GENERATING as never },
      where: { id: batchId },
    });

    await options?.onBatchStarted?.({
      batchId,
      totalCount: batchConfig.totalCount ?? batchItems.length,
    });

    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];

      if (item.status !== BatchItemStatus.PENDING) {
        continue;
      }

      try {
        item.status = BatchItemStatus.GENERATING;

        const topics = batchConfig.topics ?? [];
        const topic =
          topics.length > 0
            ? topics[i % topics.length]
            : `${item.format} content`;

        await options?.onItemStarted?.({
          batchId,
          completedCount,
          failedCount,
          index: i,
          item,
          topic,
          totalCount: batchConfig.totalCount ?? batchItems.length,
        });

        const generated = await this.contentGeneratorService.generateContent(
          orgId,
          {
            additionalContext: batchConfig.style
              ? [batchConfig.style]
              : undefined,
            brandId: batchRecord.brandId ?? undefined,
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
          brand: batchRecord.brandId,
          credential: undefined as never,
          description: item.caption,
          ingredients: [],
          label: `Batch: ${topic}`,
          organization: orgId,
          platform: item.platform as never,
          scheduledDate: item.scheduledDate
            ? new Date(item.scheduledDate)
            : undefined,
          status: PostStatus.DRAFT,
          user: batchRecord.userId,
        } as never);

        const postId = String((post as Record<string, unknown>)._id ?? post.id);
        item.postId = postId;
        item.status = BatchItemStatus.COMPLETED;
        completedCount++;

        await options?.onItemCompleted?.({
          batchId,
          completedCount,
          failedCount,
          index: i,
          item,
          postId,
          previewText: item.caption,
          topic,
          totalCount: batchConfig.totalCount ?? batchItems.length,
        });
      } catch (error: unknown) {
        item.status = BatchItemStatus.FAILED;
        item.error = error instanceof Error ? error.message : 'Unknown error';
        failedCount++;

        this.logger.error(`Batch item ${item._id} failed: ${item.error}`, {
          batchId,
          itemId: item._id,
        });

        const topics = batchConfig.topics ?? [];
        await options?.onItemFailed?.({
          batchId,
          completedCount,
          error: item.error,
          failedCount,
          index: i,
          item,
          topic:
            topics.length > 0
              ? topics[i % topics.length]
              : `${item.format} content`,
          totalCount: batchConfig.totalCount ?? batchItems.length,
        });
      }
    }

    const totalCount = batchConfig.totalCount ?? batchItems.length;
    let finalStatus: BatchStatus;
    let completedAt: string | undefined;

    if (failedCount === 0 && completedCount === totalCount) {
      finalStatus = BatchStatus.COMPLETED;
      completedAt = new Date().toISOString();
    } else if (completedCount > 0) {
      finalStatus = BatchStatus.PARTIAL;
    } else {
      finalStatus = BatchStatus.FAILED;
    }

    const updatedConfig: BatchConfig = {
      ...batchConfig,
      completedAt,
      completedCount,
      failedCount,
    };

    const updatedBatch = (await this.prisma.batch.update({
      data: {
        config: updatedConfig as never,
        items: batchItems as never,
        status: finalStatus as never,
      },
      where: { id: batchId },
    })) as BatchWithConfig;

    this.logger.log(`Batch processing complete: ${batchId}`, {
      batchId,
      completedCount,
      failedCount,
      status: finalStatus,
    });

    await options?.onBatchCompleted?.({
      batchId,
      completedCount,
      failedCount,
      status: finalStatus,
      totalCount,
    });

    return this.toBatchSummary(updatedBatch);
  }

  @HandleErrors('get batch', 'batch-generation')
  async getBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batch = (await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    })) as BatchWithConfig | null;

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
    const limit = Math.min(query?.limit ?? 20, 100);
    const offset = query?.offset ?? 0;

    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId: orgId,
    };
    if (query?.status) {
      where.status = query.status;
    }

    const [batches, total] = await Promise.all([
      this.prisma.batch.findMany({
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        where: where as never,
      }),
      this.prisma.batch.count({ where: where as never }),
    ]);

    return {
      items: await Promise.all(
        batches.map((b) => this.toBatchSummary(b as BatchWithConfig)),
      ),
      total,
    };
  }

  @HandleErrors('approve items', 'batch-generation')
  async approveItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
  ): Promise<IBatchSummary> {
    const batchRecord = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });

    if (!batchRecord) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const itemIdSet = new Set(itemIds);
    const postIdsToSchedule: string[] = [];
    const postIdsToUpdate: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = ((batchRecord.items ?? []) as BatchItemFull[]).map(
      (item) => ({ ...item }),
    );

    for (const item of batchItems) {
      if (
        itemIdSet.has(item._id) &&
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
      await this.prisma.post.updateMany({
        data: {
          reviewDecision: 'APPROVED' as never,
          reviewedAt: new Date(reviewedAt),
        },
        where: {
          id: { in: postIdsToUpdate },
          isDeleted: false,
          organizationId: orgId,
        },
      });
    }

    if (postIdsToSchedule.length > 0) {
      await this.prisma.post.updateMany({
        data: { status: PostStatus.SCHEDULED as never },
        where: {
          id: { in: postIdsToSchedule },
          isDeleted: false,
          organizationId: orgId,
        },
      });
    }

    const updatedBatch = (await this.prisma.batch.update({
      data: { items: batchItems as never },
      where: { id: batchId },
    })) as BatchWithConfig;

    this.logger.log(`Approved ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.toBatchSummary(updatedBatch);
  }

  @HandleErrors('reject items', 'batch-generation')
  async rejectItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
  ): Promise<IBatchSummary> {
    const batchRecord = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });

    if (!batchRecord) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const itemIdSet = new Set(itemIds);
    const postIdsToReject: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = ((batchRecord.items ?? []) as BatchItemFull[]).map(
      (item) => ({ ...item }),
    );

    for (const item of batchItems) {
      if (itemIdSet.has(item._id)) {
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

    if (postIdsToReject.length > 0) {
      // Soft-delete rejected posts
      await this.prisma.post.updateMany({
        data: {
          isDeleted: true,
          reviewDecision: 'REJECTED' as never,
          reviewedAt: new Date(reviewedAt),
          reviewFeedback: feedback,
        },
        where: {
          id: { in: postIdsToReject },
          isDeleted: false,
          organizationId: orgId,
        },
      });
    }

    const updatedBatch = (await this.prisma.batch.update({
      data: { items: batchItems as never },
      where: { id: batchId },
    })) as BatchWithConfig;

    this.logger.log(`Rejected ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.toBatchSummary(updatedBatch);
  }

  @HandleErrors('request changes', 'batch-generation')
  async requestChanges(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
  ): Promise<IBatchSummary> {
    const batchRecord = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });

    if (!batchRecord) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const itemIdSet = new Set(itemIds);
    const postIdsToKeepAsDraft: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = ((batchRecord.items ?? []) as BatchItemFull[]).map(
      (item) => ({ ...item }),
    );

    for (const item of batchItems) {
      if (
        itemIdSet.has(item._id) &&
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
      await this.prisma.post.updateMany({
        data: {
          reviewDecision: 'REQUEST_CHANGES' as never,
          reviewedAt: new Date(reviewedAt),
          reviewFeedback: feedback,
          status: PostStatus.DRAFT as never,
        },
        where: {
          id: { in: postIdsToKeepAsDraft },
          isDeleted: false,
          organizationId: orgId,
        },
      });
    }

    const updatedBatch = (await this.prisma.batch.update({
      data: { items: batchItems as never },
      where: { id: batchId },
    })) as BatchWithConfig;

    this.logger.log(
      `Requested changes for ${itemIds.length} items in batch ${batchId}`,
      {
        batchId,
        itemCount: itemIds.length,
      },
    );

    return this.toBatchSummary(updatedBatch);
  }

  @HandleErrors('cancel batch', 'batch-generation')
  async cancelBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batchRecord = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });

    if (!batchRecord) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const batchItems = ((batchRecord.items ?? []) as BatchItemFull[]).map(
      (item) => ({
        ...item,
        status:
          item.status === BatchItemStatus.PENDING
            ? BatchItemStatus.SKIPPED
            : item.status,
      }),
    );

    const updatedBatch = (await this.prisma.batch.update({
      data: {
        items: batchItems as never,
        status: BatchStatus.CANCELLED as never,
      },
      where: { id: batchId },
    })) as BatchWithConfig;

    this.logger.log(`Batch cancelled: ${batchId}`, { batchId });

    return this.toBatchSummary(updatedBatch);
  }

  private generateContentPlan(
    count: number,
    contentMix: ContentMixConfig,
    platforms: string[],
    _topics: string[],
    dateRangeStart: Date,
    dateRangeEnd: Date,
  ): BatchItemFull[] {
    const items: BatchItemFull[] = [];
    const formatCounts = this.calculateFormatCounts(count, contentMix);
    const timeSlots = this.distributeTimeSlots(
      count,
      dateRangeStart,
      dateRangeEnd,
    );

    let index = 0;
    const now = new Date().toISOString();
    for (const [format, formatCount] of Object.entries(formatCounts)) {
      for (let i = 0; i < formatCount; i++) {
        items.push({
          _id: crypto.randomUUID(),
          createdAt: now,
          format: format as ContentFormat,
          platform: platforms[index % platforms.length],
          scheduledDate: timeSlots[index]?.toISOString(),
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

    for (const format of formats) {
      const count = Math.round((format.percent / 100) * total);
      counts[format.key] = count;
      remaining -= count;
    }

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

  private async toBatchSummary(batch: BatchWithConfig): Promise<IBatchSummary> {
    const batchConfig = (batch.config ?? {}) as BatchConfig;
    const batchItems = (batch.items as BatchItemFull[]) ?? [];

    const pendingCount = batchItems.filter(
      (item) =>
        item.status === BatchItemStatus.PENDING ||
        item.status === BatchItemStatus.GENERATING,
    ).length;

    const postIds = batchItems
      .map((item) => item.postId)
      .filter((id): id is string => Boolean(id));

    const linkedPosts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: {
              externalId: true,
              generationId: true,
              id: true,
              lastAttemptAt: true,
              promptUsed: true,
              publishedAt: true,
              retryCount: true,
              reviewDecision: true,
              reviewedAt: true,
              reviewFeedback: true,
              status: true,
              url: true,
            },
            where: {
              id: { in: postIds },
              isDeleted: false,
              organizationId: batch.organizationId,
            },
          })
        : [];

    const linkedAnalytics =
      postIds.length > 0
        ? await this.prisma.postAnalytics.findMany({
            select: {
              engagementRate: true,
              postId: true,
              totalComments: true,
              totalLikes: true,
              totalSaves: true,
              totalShares: true,
              totalViews: true,
            },
            where: {
              organizationId: batch.organizationId,
              postId: { in: postIds },
            },
          })
        : [];

    // Aggregate analytics by postId (take max for each metric)
    const analyticsMap = new Map<
      string,
      {
        avgEngagementRate: number;
        totalComments: number;
        totalLikes: number;
        totalSaves: number;
        totalShares: number;
        totalViews: number;
      }
    >();
    for (const row of linkedAnalytics) {
      const existing = analyticsMap.get(row.postId);
      if (!existing) {
        analyticsMap.set(row.postId, {
          avgEngagementRate: row.engagementRate,
          totalComments: row.totalComments,
          totalLikes: row.totalLikes,
          totalSaves: row.totalSaves,
          totalShares: row.totalShares,
          totalViews: row.totalViews,
        });
      } else {
        analyticsMap.set(row.postId, {
          avgEngagementRate:
            (existing.avgEngagementRate + row.engagementRate) / 2,
          totalComments: Math.max(existing.totalComments, row.totalComments),
          totalLikes: Math.max(existing.totalLikes, row.totalLikes),
          totalSaves: Math.max(existing.totalSaves, row.totalSaves),
          totalShares: Math.max(existing.totalShares, row.totalShares),
          totalViews: Math.max(existing.totalViews, row.totalViews),
        });
      }
    }

    const linkedPostMap = new Map(linkedPosts.map((post) => [post.id, post]));

    return {
      brandId: batch.brandId ?? '',
      completedAt: batchConfig.completedAt,
      completedCount: batchConfig.completedCount ?? 0,
      contentMix: {
        carouselPercent: batchConfig.contentMix?.carouselPercent ?? 10,
        imagePercent: batchConfig.contentMix?.imagePercent ?? 60,
        reelPercent: batchConfig.contentMix?.reelPercent ?? 5,
        storyPercent: batchConfig.contentMix?.storyPercent ?? 0,
        videoPercent: batchConfig.contentMix?.videoPercent ?? 25,
      },
      createdAt: batch.createdAt.toISOString(),
      failedCount: batchConfig.failedCount ?? 0,
      id: batch.id,
      items: batchItems.map((item) => {
        const linkedPost = item.postId
          ? linkedPostMap.get(item.postId)
          : undefined;
        const analytics = item.postId
          ? analyticsMap.get(item.postId)
          : undefined;

        return {
          batchId: batch.id,
          caption: item.caption,
          createdAt: item.createdAt ?? batch.createdAt.toISOString(),
          error: item.error,
          format: item.format,
          gateOverallScore: item.gateOverallScore,
          gateReasons: item.gateReasons ?? [],
          id: item._id,
          mediaUrl: item.mediaUrl,
          opportunitySourceType: item.opportunitySourceType,
          opportunityTopic: item.opportunityTopic,
          platform: item.platform,
          postAvgEngagementRate: analytics?.avgEngagementRate,
          postExternalId: linkedPost?.externalId ?? undefined,
          postGenerationId: linkedPost?.generationId ?? undefined,
          postId: item.postId,
          postLastAttemptAt: linkedPost?.lastAttemptAt?.toISOString(),
          postPromptUsed: linkedPost?.promptUsed ?? undefined,
          postPublishedAt: linkedPost?.publishedAt?.toISOString(),
          postRetryCount: linkedPost?.retryCount,
          postStatus: linkedPost?.status
            ? String(linkedPost.status)
            : undefined,
          postTotalComments: analytics?.totalComments,
          postTotalLikes: analytics?.totalLikes,
          postTotalSaves: analytics?.totalSaves,
          postTotalShares: analytics?.totalShares,
          postTotalViews: analytics?.totalViews,
          postUrl: linkedPost?.url ?? undefined,
          prompt: item.prompt,
          reviewDecision: item.reviewDecision,
          reviewEvents: (item.reviewEvents ?? []).map((event) => ({
            decision: event.decision,
            feedback: event.feedback,
            reviewedAt: event.reviewedAt,
          })),
          reviewedAt: item.reviewedAt,
          reviewFeedback: item.reviewFeedback,
          scheduledDate: item.scheduledDate,
          sourceActionId: item.sourceActionId,
          sourceWorkflowId: item.sourceWorkflowId,
          sourceWorkflowName: item.sourceWorkflowName,
          status: item.status,
        };
      }),
      pendingCount,
      platforms: batchConfig.platforms ?? [],
      status: String(batch.status) as BatchStatus,
      totalCount: batchConfig.totalCount ?? batchItems.length,
    };
  }
}
