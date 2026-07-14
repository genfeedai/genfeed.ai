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

    await this.linkManualReviewPosts(batch.id, batchItems, orgId);
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
    return batchItems;
  }

  private async linkManualReviewPosts(
    batchId: string,
    batchItems: BatchItemFull[],
    orgId: string,
  ): Promise<void> {
    await Promise.all(
      batchItems.map(async (item) => {
        if (!item.postId) return;

        await this.prisma.post.updateMany({
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
}
