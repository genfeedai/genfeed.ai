import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { BatchAlreadyOwnedException } from '@api/services/batch-generation/batch-already-owned.exception';
import { BATCH_LEASE_STALE_MS } from '@api/services/batch-generation/batch-generation.constants';
import {
  type BatchConfig,
  type BatchItemFull,
  type BatchProcessOptions,
  type BatchWithConfig,
  resolveBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import {
  batchItemRowsInclude,
  writeBatchJsonAndItemRows,
} from '@api/services/batch-generation/batch-item-rows';
import {
  fromPrismaBatchStatus,
  toPrismaBatchStatus,
} from '@api/services/batch-generation/batch-status-prisma.mapper';
import {
  buildBatchDiversityContext,
  expandBatchTopics,
} from '@api/services/batch-generation/batch-topic-angles.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  BatchItemStatus,
  BatchStatus,
  ContentIntelligencePlatform,
  fromPrismaCredentialPlatform,
  PostVisibility,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type { IBatchSummary } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type BatchProcessingCounts = {
  cancelled: boolean;
  completedCount: number;
  failedCount: number;
};

/**
 * Result of trying to take ownership of a batch run.
 * - `claimed` — fresh PENDING → PROCESSING transition
 * - `resumed` — re-claimed a PROCESSING batch whose lease went stale
 * - `busy` — someone else owns it, or it is already terminal / missing
 */
type BatchClaimOutcome = 'busy' | 'claimed' | 'resumed';

/**
 * Fallback for platform ids the credential mapper does not recognise (product
 * ids with no credential platform, e.g. `product_hunt`). Canonical spellings
 * come from {@link fromPrismaCredentialPlatform} — this only normalises
 * separators and casing so an unmapped value is at least stored consistently.
 */
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
    const claim = await this.claimBatchForProcessing(batchId, orgId);

    if (claim === 'busy') {
      // Either the batch doesn't exist for this org, or it's already being processed.
      const existing = await this.prisma.batch.findFirst({
        where: scopedWhere(orgId, { id: batchId }),
      });
      if (!existing) {
        throw new NotFoundException('Batch', batchId);
      }
      // Already generating or completed — return early without re-processing.
      throw new BatchAlreadyOwnedException(batchId, String(existing.status));
    }

    const batchRecord = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

    // Copied, not aliased: the resume path below bumps `resumeCount` in place,
    // and writing that through to the fetched record would leave the caller
    // holding a row that disagrees with what was persisted.
    const batchConfig = { ...((batchRecord.config ?? {}) as BatchConfig) };
    const batchItems = resolveBatchItems(batchRecord);

    if (claim === 'resumed') {
      // The previous run died mid-batch. Items it had started but never
      // persisted go back to PENDING so they are regenerated; items already
      // persisted as COMPLETED/FAILED are left alone, so neither the work nor
      // the credits for them are duplicated.
      for (const item of batchItems) {
        if (item.status === BatchItemStatus.PROCESSING) {
          item.status = BatchItemStatus.PENDING;
          item.error = undefined;
        }
      }
      batchConfig.resumeCount = (batchConfig.resumeCount ?? 0) + 1;

      this.logger.warn(`Resuming stranded batch: ${batchId}`, {
        batchId,
        resumeCount: batchConfig.resumeCount,
      });
    }

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

    const finalized = await writeBatchJsonAndItemRows(this.prisma, {
      batchId,
      brandId: batchRecord.brandId,
      extraBatchData: {
        config: updatedConfig as Prisma.InputJsonValue,
        status: toPrismaBatchStatus(finalStatus),
      },
      items: batchItems,
      organizationId: orgId,
      whereExtra: {
        status: toPrismaBatchStatus(BatchStatus.PROCESSING),
      },
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
    // Seed from what is already persisted so a resumed run keeps the totals of
    // the items its predecessor finished instead of restarting the count.
    let completedCount = batchItems.filter(
      (entry) => entry.status === BatchItemStatus.COMPLETED,
    ).length;
    let failedCount = batchItems.filter(
      (entry) => entry.status === BatchItemStatus.FAILED,
    ).length;

    // Accumulate captions as items complete — O(1) push per item instead of
    // re-scanning the full batch on every generation call.
    const priorCaptions: string[] = batchItems
      .filter(
        (entry) =>
          entry.status === BatchItemStatus.COMPLETED &&
          Boolean(entry.caption?.trim()),
      )
      .map((entry) => entry.caption as string);

    // Empty/short topics → every item used `${format} content` and the model
    // rewrote the same brand hook N times. Expand once so each slot has a
    // distinct creative brief (user-supplied topics are kept first).
    const totalCount = batchConfig.totalCount ?? batchItems.length;
    const topics = expandBatchTopics({
      count: Math.max(totalCount, batchItems.length),
      formats: batchItems.map((entry) => entry.format),
      platforms: batchConfig.platforms ?? [],
      style: batchConfig.style,
      topics: batchConfig.topics,
    });
    batchConfig.topics = topics;

    for (let i = 0; i < batchItems.length; i++) {
      // Persist progress so far and renew the processing lease in one write.
      // A miss means the batch was cancelled or re-claimed elsewhere — this
      // replaces the old read-only status probe at the same round-trip cost,
      // and is what makes a killed run resumable without losing finished items.
      const stillOwned = await this.persistItemProgress(
        batchId,
        orgId,
        batchRecord.brandId,
        batchConfig,
        batchItems,
        completedCount,
        failedCount,
      );
      if (!stillOwned) {
        return { cancelled: true, completedCount, failedCount };
      }

      const item = batchItems[i];

      if (item.status !== BatchItemStatus.PENDING) {
        continue;
      }

      try {
        item.status = BatchItemStatus.PROCESSING;

        const topic =
          topics[i] ??
          topics[i % Math.max(topics.length, 1)] ??
          `${item.format} content`;

        const postId = await this.generateBatchItemPost({
          batchConfig,
          batchId,
          batchRecord,
          completedCount,
          failedCount,
          index: i,
          item,
          options,
          orgId,
          priorCaptions,
          topic,
          totalCount,
        });
        item.postId = postId;
        item.status = BatchItemStatus.COMPLETED;
        completedCount++;
        if (item.caption?.trim()) {
          priorCaptions.push(item.caption);
        }

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
              totalCount,
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
                topics[i] ??
                topics[i % Math.max(topics.length, 1)] ??
                `${item.format} content`,
              totalCount,
            }),
          { batchId, itemId: item.id },
        );
      }
    }
    return { cancelled: false, completedCount, failedCount };
  }

  private async generateBatchItemPost(params: {
    batchConfig: BatchConfig;
    batchId: string;
    batchRecord: BatchWithConfig;
    completedCount: number;
    failedCount: number;
    index: number;
    item: BatchItemFull;
    options?: BatchProcessOptions;
    orgId: string;
    priorCaptions: string[];
    topic: string;
    totalCount: number;
  }): Promise<string> {
    const {
      batchConfig,
      batchId,
      batchRecord,
      completedCount,
      failedCount,
      index: i,
      item,
      options,
      orgId,
      priorCaptions,
      topic,
      totalCount,
    } = params;
    // Posts store lowercase platform strings; credentials use Prisma
    // CredentialPlatform SCREAMING_SNAKE — always map via the shared helper.
    // Reject unmappable platforms *before* content generation so a bad
    // persisted item cannot burn credits or create posts (#2696).
    const platformRaw =
      typeof item.platform === 'string' && item.platform.trim().length > 0
        ? item.platform.trim()
        : undefined;
    const platformForCredential = platformRaw
      ? toPrismaCredentialPlatform(platformRaw)
      : undefined;
    if (platformRaw && !platformForCredential) {
      throw new BadRequestException(
        `Invalid batch item platform "${platformRaw}"`,
      );
    }

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
          totalCount,
        }),
      { batchId, itemId: item.id },
    );

    const generated = await this.contentGeneratorService.generateContent(
      orgId,
      {
        additionalContext: buildBatchDiversityContext({
          index: i,
          priorCaptions,
          style: batchConfig.style,
          totalCount,
        }),
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
    // Derive the post spelling from the same mapper the credential lookup
    // uses, so one item cannot persist a post platform that disagrees with
    // the credential it was matched against. Lowercasing the raw input
    // instead produced `dev_to` where the domain value is `devto`, and left
    // the alias `x` unresolved to `twitter` — two spellings for one
    // platform in `posts.platform`, which every downstream filter misses.
    const platformForPost =
      fromPrismaCredentialPlatform(platformForCredential) ??
      (platformRaw ? toPostPlatform(platformRaw) : undefined);

    // Pre-target the draft only when the answer is unambiguous. A brand may
    // hold several accounts on one platform, and a batch item carries no
    // account of its own — picking whichever row the database returned
    // first would silently commit the draft to an account the operator
    // never chose. Two or more accounts leaves credentialId null; the
    // review queue is where the account gets picked. Fanning out here would
    // multiply the queue instead, which is the publish path's job.
    let credentialId: string | null = null;
    if (platformForCredential) {
      const credentials = await this.prisma.credential.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        take: 2,
        where: scopedWhere(orgId, {
          brandId: batchRecord.brandId,
          isConnected: true,
          isDeleted: false,
          platform: platformForCredential,
        }),
      });
      credentialId =
        credentials.length === 1 ? (credentials[0]?.id ?? null) : null;
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
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: batchRecord.userId,
      visibility: PostVisibility.PUBLIC,
    } as PostCreateInput);

    return String((post as Record<string, unknown>).id ?? post.id);
  }

  private async findScopedBatch(
    batchId: string,
    orgId: string,
  ): Promise<BatchWithConfig> {
    return (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;
  }

  /**
   * Take ownership of a batch run.
   *
   * A fresh claim is the atomic PENDING → PROCESSING transition: if two callers
   * race, exactly one updateMany matches (count=1) and the other exits.
   *
   * The second attempt is the resume path. A run killed mid-batch (API reload,
   * worker restart) leaves the row PROCESSING with nothing left to finish it,
   * which used to strand the batch permanently. `updatedAt` acts as the lease —
   * every item persist bumps it — so filtering on it inside updateMany
   * re-claims a stale run atomically, and a still-live run (whose lease is
   * fresh) can never be stolen out from under itself.
   */
  private async claimBatchForProcessing(
    batchId: string,
    orgId: string,
  ): Promise<BatchClaimOutcome> {
    const claimed = await this.prisma.batch.updateMany({
      data: { status: toPrismaBatchStatus(BatchStatus.PROCESSING) },
      where: scopedWhere(orgId, {
        id: batchId,
        status: toPrismaBatchStatus(BatchStatus.PENDING),
      }),
    });
    if (claimed.count === 1) {
      return 'claimed';
    }

    const staleBefore = new Date(Date.now() - BATCH_LEASE_STALE_MS);
    const resumed = await this.prisma.batch.updateMany({
      data: { status: toPrismaBatchStatus(BatchStatus.PROCESSING) },
      where: scopedWhere(orgId, {
        id: batchId,
        status: toPrismaBatchStatus(BatchStatus.PROCESSING),
        updatedAt: { lt: staleBefore },
      }),
    });
    if (resumed.count === 1) {
      return 'resumed';
    }

    return 'busy';
  }

  /**
   * Write item results accumulated so far and renew the run lease.
   *
   * Returns false when the batch is no longer ours — cancelled, or re-claimed
   * by another run — in which case the caller must stop without finalizing.
   */
  private async persistItemProgress(
    batchId: string,
    orgId: string,
    brandId: string | null | undefined,
    batchConfig: BatchConfig,
    batchItems: BatchItemFull[],
    completedCount: number,
    failedCount: number,
  ): Promise<boolean> {
    const progressConfig: BatchConfig = {
      ...batchConfig,
      completedCount,
      failedCount,
    };

    const persisted = await writeBatchJsonAndItemRows(this.prisma, {
      batchId,
      brandId,
      extraBatchData: {
        config: progressConfig as Prisma.InputJsonValue,
      },
      items: batchItems,
      organizationId: orgId,
      whereExtra: {
        status: toPrismaBatchStatus(BatchStatus.PROCESSING),
      },
    });

    return persisted.count === 1;
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
