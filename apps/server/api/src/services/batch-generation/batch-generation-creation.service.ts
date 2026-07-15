import { BrandsService } from '@api/collections/brands/services/brands.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import type {
  BatchConfig,
  BatchItemFull,
  BatchWithConfig,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import type { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PostStatus,
} from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class BatchGenerationCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly postsService: PostsService,
    private readonly cacheService: CacheService,
    private readonly summaryService: BatchGenerationSummaryService,
  ) {}

  async createBatch(
    dto: CreateBatchDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
  ): Promise<IBatchSummary> {
    if (idempotencyKey) {
      return runIdempotent(this.cacheService, idempotencyKey, () =>
        this.doCreateBatch(dto, userId, orgId),
      );
    }

    return this.doCreateBatch(dto, userId, orgId);
  }

  private async doCreateBatch(
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
      throw new NotFoundException('Brand', dto.brandId);
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

    return this.summaryService.toBatchSummary(batch);
  }

  async createManualReviewBatch(
    dto: CreateManualReviewBatchDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
  ): Promise<IBatchSummary> {
    if (idempotencyKey) {
      return runIdempotent(this.cacheService, idempotencyKey, () =>
        this.doCreateManualReviewBatch(dto, userId, orgId),
      );
    }

    return this.doCreateManualReviewBatch(dto, userId, orgId);
  }

  private async doCreateManualReviewBatch(
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
      throw new NotFoundException('Brand', dto.brandId);
    }

    await this.validateIngredientOwnership(dto, orgId);
    const batchItems = await this.createManualReviewItems(dto, userId, orgId);

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

    let batch: BatchWithConfig;
    let createdBatchId: string | undefined;
    try {
      batch = (await this.prisma.batch.create({
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
      createdBatchId = batch.id;

      await this.linkManualReviewPosts(batch.id, batchItems, orgId);
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(
        createdBatchId,
        batchItems,
        orgId,
      );
      throw error;
    }

    this.logger.log(`Manual review batch created: ${batch.id}`, {
      batchId: batch.id,
      itemCount: batchItems.length,
      orgId,
    });

    return this.summaryService.toBatchSummary(batch);
  }

  private async validateIngredientOwnership(
    dto: CreateManualReviewBatchDto,
    orgId: string,
  ): Promise<void> {
    const ingredientIds = [
      ...new Set(
        dto.items
          .map((item) => item.ingredientId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ingredientIds.length === 0) return;

    const ownedIngredients = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: {
        id: { in: ingredientIds },
        isDeleted: false,
        organizationId: orgId,
      },
    });
    if (ownedIngredients.length !== ingredientIds.length) {
      throw new BadRequestException(
        'One or more ingredient IDs do not belong to this organization',
      );
    }
  }

  private async createManualReviewItems(
    dto: CreateManualReviewBatchDto,
    userId: string,
    orgId: string,
  ): Promise<BatchItemFull[]> {
    const batchItems: BatchItemFull[] = [];
    try {
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

        const postId = String((post as Record<string, unknown>).id ?? post.id);

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
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(undefined, batchItems, orgId);
      throw error;
    }
    return batchItems;
  }

  private async linkManualReviewPosts(
    batchId: string,
    batchItems: BatchItemFull[],
    orgId: string,
  ): Promise<void> {
    const results = await Promise.all(
      batchItems.map(async (item) => {
        if (!item.postId) return { count: 0 };

        return this.prisma.post.updateMany({
          data: {
            reviewBatchId: batchId,
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

    if (results.some((result) => result.count !== 1)) {
      throw new NotFoundException({
        message:
          'A manual review post disappeared before batch linking completed',
      });
    }
  }

  private async compensateManualReviewCreation(
    batchId: string | undefined,
    batchItems: BatchItemFull[],
    orgId: string,
  ): Promise<void> {
    try {
      const postIds = batchItems.flatMap((item) =>
        item.postId ? [item.postId] : [],
      );
      if (postIds.length > 0) {
        await this.prisma.post.updateMany({
          data: { isDeleted: true },
          where: {
            id: { in: postIds },
            isDeleted: false,
            organizationId: orgId,
          },
        });
      }
      if (batchId) {
        await this.prisma.batch.updateMany({
          data: { isDeleted: true },
          where: { id: batchId, isDeleted: false, organizationId: orgId },
        });
      }
    } catch (cleanupError: unknown) {
      this.logger.error('Manual review batch compensation failed', {
        batchId,
        cleanupError,
        orgId,
      });
    }
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
    const formats: Array<{ key: ContentFormat; percent: number }> = [
      { key: ContentFormat.IMAGE, percent: contentMix.imagePercent },
      { key: ContentFormat.VIDEO, percent: contentMix.videoPercent },
      { key: ContentFormat.CAROUSEL, percent: contentMix.carouselPercent },
      { key: ContentFormat.REEL, percent: contentMix.reelPercent },
      { key: ContentFormat.STORY, percent: contentMix.storyPercent },
    ];

    const safeTotal = Math.max(0, Math.floor(total));
    const percentTotal = formats.reduce(
      (sum, format) => sum + Math.max(0, format.percent),
      0,
    );
    if (percentTotal === 0) {
      return Object.fromEntries(
        formats.map((format, index) => [
          format.key,
          index === 0 ? safeTotal : 0,
        ]),
      );
    }

    const allocations = formats.map((format, index) => {
      const exact = (Math.max(0, format.percent) / percentTotal) * safeTotal;
      return { count: Math.floor(exact), fraction: exact % 1, format, index };
    });
    let remaining =
      safeTotal - allocations.reduce((sum, item) => sum + item.count, 0);
    const byRemainder = [...allocations].sort(
      (a, b) => b.fraction - a.fraction || a.index - b.index,
    );
    for (let index = 0; remaining > 0; index++, remaining--) {
      byRemainder[index % byRemainder.length].count++;
    }

    const counts: Record<string, number> = {};
    for (const allocation of allocations) {
      counts[allocation.format.key] = allocation.count;
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
}
