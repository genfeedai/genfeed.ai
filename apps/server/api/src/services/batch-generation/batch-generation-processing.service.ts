import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import {
  type BatchConfig,
  type BatchItemFull,
  type BatchProcessOptions,
  type BatchWithConfig,
  cloneBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { BatchItemStatus, BatchStatus, PostStatus } from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type BatchProcessingCounts = {
  cancelled: boolean;
  completedCount: number;
  failedCount: number;
};

@Injectable()
export class BatchGenerationProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly summaryService: BatchGenerationSummaryService,
  ) {}

  async processBatch(
    batchId: string,
    orgId: string,
    options?: BatchProcessOptions,
  ): Promise<IBatchSummary> {
    // Idempotency guard: atomically transition PENDING → GENERATING.
    // If two concurrent calls race, exactly one updateMany will match (count=1);
    // the other gets count=0 and exits early, preventing duplicate processing.
    const claimed = await this.prisma.batch.updateMany({
      data: { status: BatchStatus.GENERATING as never },
      where: {
        id: batchId,
        isDeleted: false,
        organizationId: orgId,
        status: BatchStatus.PENDING as never,
      },
    });

    if (claimed.count === 0) {
      // Either the batch doesn't exist for this org, or it's already being processed.
      const existing = await this.prisma.batch.findFirst({
        where: { id: batchId, isDeleted: false, organizationId: orgId },
      });
      if (!existing) {
        throw new NotFoundException('Batch', batchId);
      }
      // Already generating or completed — return early without re-processing.
      throw new BadRequestException(
        `Batch ${batchId} is already being processed (status: ${String(existing.status)})`,
      );
    }

    const batchRecord = (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;

    const batchConfig = (batchRecord.config ?? {}) as BatchConfig;
    const batchItems = cloneBatchItems(batchRecord.items);

    await this.invokeLifecycleCallback(
      'onBatchStarted',
      () =>
        options?.onBatchStarted?.({
          batchId,
          totalCount: batchConfig.totalCount ?? batchItems.length,
        }),
      { batchId },
    );

    const { cancelled, completedCount, failedCount } = await this.processItems(
      batchId,
      orgId,
      batchRecord,
      batchConfig,
      batchItems,
      options,
    );

    if (cancelled) {
      const cancelledBatch = await this.findScopedBatch(batchId, orgId);
      return this.summaryService.toBatchSummary(cancelledBatch);
    }

    const totalCount = batchConfig.totalCount ?? batchItems.length;
    const finalStatus =
      failedCount === 0 && completedCount === totalCount
        ? BatchStatus.COMPLETED
        : completedCount > 0
          ? BatchStatus.PARTIAL
          : BatchStatus.FAILED;
    const updatedConfig: BatchConfig = {
      ...batchConfig,
      completedAt:
        finalStatus === BatchStatus.COMPLETED
          ? new Date().toISOString()
          : undefined,
      completedCount,
      failedCount,
    };

    const finalized = await this.prisma.batch.updateMany({
      data: {
        config: updatedConfig as never,
        items: batchItems as never,
        status: finalStatus as never,
      },
      where: {
        id: batchId,
        isDeleted: false,
        organizationId: orgId,
        status: BatchStatus.GENERATING as never,
      },
    });

    if (finalized.count !== 1) {
      const currentBatch = await this.findScopedBatch(batchId, orgId);
      if (currentBatch.status === BatchStatus.CANCELLED) {
        return this.summaryService.toBatchSummary(currentBatch);
      }
      throw new BadRequestException(
        `Batch ${batchId} changed state while processing`,
      );
    }

    const updatedBatch = await this.findScopedBatch(batchId, orgId);

    this.logger.log(`Batch processing complete: ${batchId}`, {
      batchId,
      completedCount,
      failedCount,
      status: finalStatus,
    });
    await this.invokeLifecycleCallback(
      'onBatchCompleted',
      () =>
        options?.onBatchCompleted?.({
          batchId,
          completedCount,
          failedCount,
          status: finalStatus,
          totalCount,
        }),
      { batchId },
    );
    return this.summaryService.toBatchSummary(updatedBatch);
  }

  private async processItems(
    batchId: string,
    orgId: string,
    batchRecord: BatchWithConfig,
    batchConfig: BatchConfig,
    batchItems: BatchItemFull[],
    options?: BatchProcessOptions,
  ): Promise<BatchProcessingCounts> {
    let completedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < batchItems.length; i++) {
      if (!(await this.isBatchGenerating(batchId, orgId))) {
        return { cancelled: true, completedCount, failedCount };
      }

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

        await this.invokeLifecycleCallback(
          'onItemStarted',
          () =>
            options?.onItemStarted?.({
              batchId,
              completedCount,
              failedCount,
              index: i,
              item,
              topic,
              totalCount: batchConfig.totalCount ?? batchItems.length,
            }),
          { batchId, itemId: item._id },
        );

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

        const postId = String((post as Record<string, unknown>).id ?? post.id);
        item.postId = postId;
        item.status = BatchItemStatus.COMPLETED;
        completedCount++;

        await this.invokeLifecycleCallback(
          'onItemCompleted',
          () =>
            options?.onItemCompleted?.({
              batchId,
              completedCount,
              failedCount,
              index: i,
              item,
              postId,
              previewText: item.caption,
              topic,
              totalCount: batchConfig.totalCount ?? batchItems.length,
            }),
          { batchId, itemId: item._id },
        );
      } catch (error: unknown) {
        item.status = BatchItemStatus.FAILED;
        item.error = error instanceof Error ? error.message : 'Unknown error';
        failedCount++;

        this.logger.error(`Batch item ${item._id} failed: ${item.error}`, {
          batchId,
          itemId: item._id,
        });

        const topics = batchConfig.topics ?? [];
        await this.invokeLifecycleCallback(
          'onItemFailed',
          () =>
            options?.onItemFailed?.({
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
            }),
          { batchId, itemId: item._id },
        );
      }
    }
    return { cancelled: false, completedCount, failedCount };
  }

  private async findScopedBatch(
    batchId: string,
    orgId: string,
  ): Promise<BatchWithConfig> {
    return (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;
  }

  private async isBatchGenerating(
    batchId: string,
    orgId: string,
  ): Promise<boolean> {
    const batch = await this.prisma.batch.findFirst({
      select: { status: true },
      where: {
        id: batchId,
        isDeleted: false,
        organizationId: orgId,
      },
    });
    return batch?.status === BatchStatus.GENERATING;
  }

  private async invokeLifecycleCallback(
    callbackName: string,
    callback: (() => Promise<void> | void) | undefined,
    context: Record<string, unknown>,
  ): Promise<void> {
    if (!callback) return;

    try {
      await callback();
    } catch (error: unknown) {
      this.logger.error(`Batch lifecycle callback ${callbackName} failed`, {
        ...context,
        error,
      });
    }
  }
}
