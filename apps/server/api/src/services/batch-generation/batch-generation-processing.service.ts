import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
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
import {
  fromPrismaBatchStatus,
  toPrismaBatchStatus,
} from '@api/services/batch-generation/batch-status-prisma.mapper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  BatchItemStatus,
  BatchStatus,
  ContentIntelligencePlatform,
  PostStatus,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import {
  type Prisma,
  CredentialPlatform as PrismaCredentialPlatform,
} from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type BatchProcessingCounts = {
  cancelled: boolean;
  completedCount: number;
  failedCount: number;
};

/** Posts store lowercase platform strings (String column, not Prisma enum). */
function toPostPlatform(platform: string): string {
  return platform.trim().toLowerCase().replace(/-/g, '_');
}

function toBatchItemFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  const message = error.message;
  if (
    /Null constraint violation|Argument `.+` is missing|Invalid.*credentialId/i.test(
      message,
    )
  ) {
    const fieldMatch = message.match(/`([A-Za-z]+)`/);
    const field = fieldMatch?.[1];
    return field
      ? `Draft post create failed: missing or invalid "${field}". Connect a brand social account for this platform, or leave the draft untargeted.`
      : 'Draft post create failed due to a database constraint. Connect a brand social account for this platform, or leave the draft untargeted.';
  }

  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? message;
}

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
    // Idempotency guard: atomically transition PENDING → PROCESSING.
    // If two concurrent calls race, exactly one updateMany will match (count=1);
    // the other gets count=0 and exits early, preventing duplicate processing.
    const claimed = await this.prisma.batch.updateMany({
      data: { status: toPrismaBatchStatus(BatchStatus.PROCESSING) },
      where: scopedWhere(orgId, {
        id: batchId,
        status: toPrismaBatchStatus(BatchStatus.PENDING),
      }),
    });

    if (claimed.count === 0) {
      // Either the batch doesn't exist for this org, or it's already being processed.
      const existing = await this.prisma.batch.findFirst({
        where: scopedWhere(orgId, { id: batchId }),
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
      { where: scopedWhere(orgId, { id: batchId }) },
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
        config: updatedConfig as Prisma.InputJsonValue,
        items: batchItems as unknown as Prisma.InputJsonValue,
        status: toPrismaBatchStatus(finalStatus),
      },
      where: scopedWhere(orgId, {
        id: batchId,
        status: toPrismaBatchStatus(BatchStatus.PROCESSING),
      }),
    });

    if (finalized.count !== 1) {
      const currentBatch = await this.findScopedBatch(batchId, orgId);
      if (
        fromPrismaBatchStatus(String(currentBatch.status)) ===
        BatchStatus.CANCELLED
      ) {
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
        item.status = BatchItemStatus.PROCESSING;

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
          { batchId, itemId: item.id },
        );

        const generated = await this.contentGeneratorService.generateContent(
          orgId,
          {
            additionalContext: batchConfig.style
              ? [batchConfig.style]
              : undefined,
            brandId: batchRecord.brandId ?? undefined,
            platform: item.platform as ContentIntelligencePlatform,
            topic,
            variationsCount: 1,
          },
        );

        const content = generated[0];
        item.prompt = content?.content ?? topic;
        item.caption = content?.content ?? '';

        if (!batchRecord.brandId || !batchRecord.userId) {
          throw new BadRequestException(
            'Batch is missing brandId or userId; cannot create draft posts',
          );
        }

        const caption =
          item.caption?.trim() ||
          item.prompt?.trim() ||
          topic.trim() ||
          'Draft post';

        // Posts store lowercase platform strings; credentials use Prisma
        // CredentialPlatform SCREAMING_SNAKE — always map via the shared helper.
        const platformRaw =
          typeof item.platform === 'string' && item.platform.trim().length > 0
            ? item.platform.trim()
            : undefined;
        const platformForPost = platformRaw
          ? toPostPlatform(platformRaw)
          : undefined;
        const platformForCredential = platformRaw
          ? toPrismaCredentialPlatform(platformRaw)
          : undefined;

        // Prefer a connected brand credential for the item platform so drafts
        // land on a real target. credentialId remains nullable for untargeted
        // drafts when no matching credential exists.
        let credentialId: string | null = null;
        if (platformForCredential) {
          const credential = await this.prisma.credential.findFirst({
            select: { id: true },
            where: scopedWhere(orgId, {
              brandId: batchRecord.brandId,
              isConnected: true,
              isDeleted: false,
              platform: platformForCredential,
            }),
          });
          credentialId = credential?.id ?? null;
        }

        const post = await this.postsService.create({
          brandId: batchRecord.brandId,
          ...(credentialId ? { credentialId } : {}),
          description: caption,
          ingredients: [],
          label: `Batch: ${topic}`.slice(0, 200),
          organizationId: orgId,
          platform: platformForPost,
          scheduledDate: item.scheduledDate
            ? new Date(item.scheduledDate)
            : undefined,
          status: PostStatus.DRAFT,
          userId: batchRecord.userId,
        } as PostCreateInput);

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
          { batchId, itemId: item.id },
        );
      } catch (error: unknown) {
        item.status = BatchItemStatus.FAILED;
        item.error = toBatchItemFailureMessage(error);
        failedCount++;

        this.logger.error(`Batch item ${item.id} failed: ${item.error}`, {
          batchId,
          itemId: item.id,
          rawError: error instanceof Error ? error.message : error,
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
          { batchId, itemId: item.id },
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
      { where: scopedWhere(orgId, { id: batchId }) },
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
      where: scopedWhere(orgId, { id: batchId }),
    });
    return fromPrismaBatchStatus(batch?.status) === BatchStatus.PROCESSING;
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
