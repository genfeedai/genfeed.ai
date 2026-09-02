import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { scopedWhere } from '@api/index';
import type {
  BatchConfig,
  BatchItemFull,
  BatchWithConfig,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import {
  persistBatchItemRows,
  withBatchWriteTransaction,
} from '@api/services/batch-generation/batch-item-rows';
import { toPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import type { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PostVisibility,
  parsePlatform,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
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
      id: dto.brandId,
      organizationId: orgId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', dto.brandId);
    }

    const platforms = this.normalizeBatchPlatforms(dto.platforms);

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
      platforms,
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
      platforms,
      style: dto.style,
      topics: dto.topics ?? [],
      totalCount: dto.count,
    };

    const batch = await withBatchWriteTransaction(this.prisma, async (tx) => {
      const created = (await tx.batch.create({
        data: {
          brandId: dto.brandId,
          config: config as Prisma.InputJsonValue,
          isDeleted: false,
          items: items as unknown as Prisma.InputJsonValue,
          organizationId: orgId,
          status: toPrismaBatchStatus(BatchStatus.PENDING),
          userId,
        },
      })) as BatchWithConfig;
      await persistBatchItemRows(tx, {
        batchId: created.id,
        brandId: dto.brandId,
        items,
        organizationId: orgId,
      });
      return created;
    });

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
      id: dto.brandId,
      organizationId: orgId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', dto.brandId);
    }

    await this.validateIngredientOwnership(dto, orgId);
    const { createdPostIds, items: batchItems } =
      await this.createManualReviewItems(dto, userId, orgId);

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
      batch = await withBatchWriteTransaction(this.prisma, async (tx) => {
        const created = (await tx.batch.create({
          data: {
            brandId: dto.brandId,
            config: config as Prisma.InputJsonValue,
            isDeleted: false,
            items: batchItems as unknown as Prisma.InputJsonValue,
            organizationId: orgId,
            status: toPrismaBatchStatus(BatchStatus.COMPLETED),
            userId,
          },
        })) as BatchWithConfig;
        createdBatchId = created.id;
        await persistBatchItemRows(tx, {
          batchId: created.id,
          brandId: dto.brandId,
          items: batchItems,
          organizationId: orgId,
        });
        return created;
      });

      await this.linkManualReviewPosts(
        batch.id,
        batchItems,
        orgId,
        dto.brandId,
      );
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(
        createdBatchId,
        createdPostIds,
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
    if (ingredientIds.length > 0) {
      const ownedIngredients = await this.prisma.ingredient.findMany({
        select: { id: true },
        where: scopedWhere(orgId, { id: { in: ingredientIds } }),
      });
      if (ownedIngredients.length !== ingredientIds.length) {
        throw new BadRequestException(
          'One or more ingredient IDs do not belong to this organization',
        );
      }
    }

    const suppliedPostIds = dto.items
      .map((item) => item.postId)
      .filter((id): id is string => Boolean(id));
    const existingPostIds = [...new Set(suppliedPostIds)];
    if (existingPostIds.length === 0) return;
    if (existingPostIds.length !== suppliedPostIds.length) {
      throw new BadRequestException(
        'A Post can appear only once in a manual review batch',
      );
    }
    const ownedPosts = await this.prisma.post.findMany({
      select: { id: true },
      where: scopedWhere(orgId, {
        brandId: dto.brandId,
        id: { in: existingPostIds },
      }),
    });
    if (ownedPosts.length !== existingPostIds.length) {
      throw new BadRequestException(
        'One or more post IDs do not belong to this organization and brand',
      );
    }
  }

  private async createManualReviewItems(
    dto: CreateManualReviewBatchDto,
    userId: string,
    orgId: string,
  ): Promise<{ createdPostIds: string[]; items: BatchItemFull[] }> {
    const batchItems: BatchItemFull[] = [];
    const createdPostIds: string[] = [];
    try {
      for (const reviewItem of dto.items) {
        const contentRunId = reviewItem.contentRunId
          ? String(reviewItem.contentRunId)
          : undefined;
        let postId = reviewItem.postId;
        if (!postId && reviewItem.targetIdempotencyKey) {
          // tenant-scope-ignore: organizationId and brandId are pinned; isDeleted is omitted so the unique key can restore a tombstone
          const existing = await this.prisma.post.findFirst({
            select: { id: true, isDeleted: true },
            where: {
              brandId: dto.brandId,
              organizationId: orgId,
              targetIdempotencyKey: reviewItem.targetIdempotencyKey,
            },
          });
          postId = existing?.id;
          if (existing?.isDeleted) {
            const restored = await this.prisma.post.updateMany({
              data: { isDeleted: false },
              where: {
                brandId: dto.brandId,
                id: existing.id,
                isDeleted: true,
                organizationId: orgId,
              },
            });
            if (restored.count !== 1) {
              throw new BadRequestException(
                'The idempotent Review Post changed while it was being restored',
              );
            }
          }
        }
        if (!postId) {
          const post = await this.postsService.create({
            brandId: dto.brandId,
            contentRunId,
            creativeVersion: reviewItem.creativeVersion,
            description:
              reviewItem.caption ??
              reviewItem.prompt ??
              'Review this asset before publishing',
            hookVersion: reviewItem.hookVersion,
            ingredients: reviewItem.ingredientId
              ? [reviewItem.ingredientId]
              : [],
            label: reviewItem.label ?? `Review ${reviewItem.format} draft`,
            organizationId: orgId,
            platform: reviewItem.platform,
            publishIntent: reviewItem.publishIntent,
            promptUsed: reviewItem.prompt,
            scheduleSlot: reviewItem.scheduleSlot,
            sourceActionId: reviewItem.sourceActionId,
            sourceWorkflowId: reviewItem.sourceWorkflowId,
            sourceWorkflowName: reviewItem.sourceWorkflowName,
            targetExecutionState: TargetExecutionState.DRAFT,
            targetIdempotencyKey: reviewItem.targetIdempotencyKey,
            userId: userId,
            variantId: reviewItem.variantId,
            visibility: PostVisibility.PUBLIC,
            workflowExecutionId: reviewItem.workflowExecutionId,
          } as PostCreateInput);

          postId = String((post as Record<string, unknown>).id ?? post.id);
          createdPostIds.push(postId);
        }

        batchItems.push({
          id: crypto.randomUUID(),
          caption: reviewItem.caption,
          contentRunId,
          creativeVersion: reviewItem.creativeVersion,
          format: reviewItem.format as ContentFormat,
          gateOverallScore: reviewItem.gateOverallScore,
          gateReasons: reviewItem.gateReasons ?? [],
          hookVersion: reviewItem.hookVersion,
          ingredientId: reviewItem.ingredientId,
          mediaUrl: reviewItem.mediaUrl,
          opportunitySourceType: reviewItem.opportunitySourceType,
          opportunityTopic: reviewItem.opportunityTopic,
          platform: reviewItem.platform,
          postId,
          publishIntent: reviewItem.publishIntent,
          prompt: reviewItem.prompt,
          reviewDecision: ReviewDecision.UNSET,
          reviewEvents: [],
          scheduleSlot: reviewItem.scheduleSlot,
          sourceActionId: reviewItem.sourceActionId,
          sourceWorkflowId: reviewItem.sourceWorkflowId,
          sourceWorkflowName: reviewItem.sourceWorkflowName,
          status: BatchItemStatus.COMPLETED,
          engagementAction: reviewItem.engagementAction,
          targetAuthor: reviewItem.targetAuthor,
          targetPostContent: reviewItem.targetPostContent,
          targetPostId: reviewItem.targetPostId,
          targetPostUrl: reviewItem.targetPostUrl,
          type: reviewItem.type,
          variantId: reviewItem.variantId,
          workflowExecutionId: reviewItem.workflowExecutionId,
        });
      }
    } catch (error: unknown) {
      await this.compensateManualReviewCreation(
        undefined,
        createdPostIds,
        orgId,
      );
      throw error;
    }
    return { createdPostIds, items: batchItems };
  }

  private async linkManualReviewPosts(
    batchId: string,
    batchItems: BatchItemFull[],
    orgId: string,
    brandId: string,
  ): Promise<void> {
    const results = await Promise.all(
      batchItems.map(async (item) => {
        if (!item.postId) return { count: 0 };

        return this.prisma.post.updateMany({
          data: {
            reviewBatchId: batchId,
            reviewItemId: item.id,
          },
          where: scopedWhere(orgId, { brandId, id: item.postId }),
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
    createdPostIds: string[],
    orgId: string,
  ): Promise<void> {
    try {
      if (batchId) {
        await this.prisma.post.updateMany({
          data: { reviewBatchId: null, reviewItemId: null },
          where: scopedWhere(orgId, { reviewBatchId: batchId }),
        });
      }
      if (createdPostIds.length > 0) {
        await this.prisma.post.updateMany({
          data: { isDeleted: true },
          where: scopedWhere(orgId, { id: { in: createdPostIds } }),
        });
      }
      if (batchId) {
        await this.prisma.batch.updateMany({
          data: { isDeleted: true },
          where: scopedWhere(orgId, { id: batchId }),
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

  /**
   * Map free-text platform inputs onto domain Platform values. Reject the
   * whole request when any entry is unmappable so we never persist malformed
   * platform strings into batch items (#2696).
   */
  private normalizeBatchPlatforms(platforms: string[]): string[] {
    if (!Array.isArray(platforms) || platforms.length === 0) {
      throw new BadRequestException(
        'At least one platform is required for batch generation',
      );
    }

    const normalized: string[] = [];
    const invalid: string[] = [];

    for (const raw of platforms) {
      const parsed = parsePlatform(raw);
      if (!parsed) {
        invalid.push(String(raw ?? ''));
        continue;
      }
      if (!normalized.includes(parsed)) {
        normalized.push(parsed);
      }
    }

    if (invalid.length > 0 || normalized.length === 0) {
      throw new BadRequestException(
        `Invalid batch platform(s): ${invalid.join(', ') || '(empty)'}. Use a supported platform id.`,
      );
    }

    return normalized;
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
          id: crypto.randomUUID(),
          createdAt: now,
          format: format as ContentFormat,
          platform: platforms[index % platforms.length],
          reviewDecision: ReviewDecision.UNSET,
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
