import { randomUUID } from 'node:crypto';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { resolveBatchItems } from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { batchItemRowsInclude } from '@api/services/batch-generation/batch-item-rows';
import {
  BATCH_REWRITE_TASK_LABEL,
  type BatchRewriteJob,
  NON_REWRITABLE_POST_STATES,
  readBatchRewriteProgress,
  resolveFinalRewriteStatus,
} from '@api/services/batch-generation/batch-rewrite-job.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  BatchItemStatus,
  BatchRewriteItemFailureReason,
  BatchRewriteJobStatus,
  CreditReservationStatus,
} from '@genfeedai/contracts';
import type { IBatchRewriteJobProgress } from '@genfeedai/contracts/interfaces';
import {
  BATCH_REWRITE_QUEUE,
  type BatchRewriteJobData,
  type BatchRewriteJobResult,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/** Outlives any single item's rewrite; the expiry sweep frees a crashed hold. */
const ITEM_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;
const REWRITE_PROMPT =
  'Rewrite this content to improve clarity, specificity, and engagement while preserving its meaning and brand voice.';

/**
 * Runs a queued Review batch rewrite in the workers app (#5365). Each item is
 * its own unit of work: reserve its credits, rewrite, apply under the batch and
 * post locks, then settle — or release on failure — so a partial run keeps and
 * bills only the captions it actually rewrote. Progress is persisted on the
 * job, which lets a retried or stalled job resume without redoing items.
 */
@Injectable()
export class BatchGenerationRewriteRunnerService {
  private readonly context = {
    service: BatchGenerationRewriteRunnerService.name,
  };

  constructor(
    @InjectQueue(BATCH_REWRITE_QUEUE)
    private readonly queue: Queue<BatchRewriteJobData, BatchRewriteJobResult>,
    private readonly prisma: PrismaService,
    private readonly postGenerationService: PostGenerationService,
    private readonly reviewService: BatchGenerationReviewService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly creditDeductionQueueService: CreditDeductionQueueService,
    private readonly loggerService: LoggerService,
  ) {}

  async run(job: BatchRewriteJob): Promise<BatchRewriteJobResult> {
    const { data } = job;
    const jobId = job.id ?? '';
    const progress = readBatchRewriteProgress(job.progress);
    try {
      await this.publish(data, jobId, 'processing', progress);
      let isCancelled = false;
      for (const itemId of data.itemIds) {
        if (
          progress.completedItemIds.includes(itemId) ||
          progress.failedItems.some((failure) => failure.itemId === itemId)
        ) {
          continue;
        }
        if (await this.isCancelRequested(jobId)) {
          isCancelled = true;
          break;
        }
        const failure = await this.rewriteItem(data, jobId, itemId);
        if (failure) {
          progress.failedItems.push({ itemId, reason: failure });
        } else {
          progress.completedItemIds.push(itemId);
        }
        await job.updateProgress(progress);
        await this.publish(data, jobId, 'processing', progress);
      }

      const status = resolveFinalRewriteStatus(progress, isCancelled);
      await this.activityRecorder.update(
        { id: data.activityId, organizationId: data.organizationId },
        {
          isRead: false,
          key: progress.completedItemIds.length
            ? ActivityKey.POST_GENERATED
            : ActivityKey.POST_FAILED,
          source: ActivitySource.POST_ENHANCEMENT,
        },
      );
      await this.publish(
        data,
        jobId,
        status === BatchRewriteJobStatus.FAILED ? 'failed' : 'completed',
        progress,
      );
      return { ...progress, status };
    } catch (error: unknown) {
      await this.activityRecorder.update(
        { id: data.activityId, organizationId: data.organizationId },
        {
          isRead: false,
          key: ActivityKey.POST_FAILED,
          source: ActivitySource.POST_ENHANCEMENT,
        },
      );
      await this.publish(data, jobId, 'failed', progress, error);
      throw error;
    }
  }

  private async rewriteItem(
    data: BatchRewriteJobData,
    jobId: string,
    itemId: string,
  ): Promise<BatchRewriteItemFailureReason | null> {
    const amount = data.credits.amountPerItem;
    let reservationId: string | undefined;
    if (amount > 0) {
      try {
        const reservation = await this.reserveItemCredits(data, jobId, itemId);
        // A resumed job already rewrote and billed this item before it stalled.
        if (reservation.status === CreditReservationStatus.SETTLED) return null;
        reservationId = reservation.id;
      } catch (error: unknown) {
        if (
          error instanceof BusinessLogicException &&
          error.errorCode === 'INSUFFICIENT_CREDITS'
        ) {
          return BatchRewriteItemFailureReason.INSUFFICIENT_CREDITS;
        }
        throw error;
      }
    }

    let failure: BatchRewriteItemFailureReason | null;
    try {
      failure = await this.applyItemRewrite(data, jobId, itemId);
    } catch (error: unknown) {
      await this.releaseItemCredits(data, reservationId);
      throw error;
    }
    if (failure) {
      await this.releaseItemCredits(data, reservationId);
      return failure;
    }
    if (reservationId) {
      await this.settleItemCredits(data, jobId, itemId, reservationId);
    }
    return null;
  }

  private async applyItemRewrite(
    data: BatchRewriteJobData,
    jobId: string,
    itemId: string,
  ): Promise<BatchRewriteItemFailureReason | null> {
    const { batchId, brandId, organizationId, userId } = data;
    const batch = await this.prisma.batch.findFirst({
      include: batchItemRowsInclude(organizationId),
      where: { id: batchId, organizationId, isDeleted: false },
    });
    const item = batch
      ? resolveBatchItems(batch).find((candidate) => candidate.id === itemId)
      : undefined;
    if (!item || item.status !== BatchItemStatus.COMPLETED) {
      return BatchRewriteItemFailureReason.NOT_REWRITABLE;
    }
    // This job committed the caption before it stopped (the marker is written
    // in the apply transaction): settle it rather than read the version bump
    // it caused as a reviewer's edit.
    if (item.reviewEvents?.some((event) => event.rewriteJobId === jobId)) {
      return null;
    }
    const post = item.postId
      ? await this.prisma.post.findFirst({
          where: { id: item.postId, organizationId, brandId, isDeleted: false },
        })
      : null;
    const postVersions = new Map<string, Date>();
    if (item.postId) {
      if (!post || NON_REWRITABLE_POST_STATES.has(post.targetExecutionState)) {
        return BatchRewriteItemFailureReason.NOT_REWRITABLE;
      }
      // Edited since the rewrite was queued: keep the reviewer's change.
      if (post.updatedAt.toISOString() !== data.postVersions[item.postId]) {
        return BatchRewriteItemFailureReason.CONFLICT;
      }
      postVersions.set(post.id, post.updatedAt);
    }

    let caption: string;
    try {
      caption = await this.postGenerationService.enhanceDescription(
        {
          description: post?.description ?? item.caption ?? item.prompt ?? '',
          platform: post?.platform ?? item.platform ?? null,
        },
        { prompt: REWRITE_PROMPT },
        { organizationId },
      );
    } catch (error: unknown) {
      this.loggerService.warn('Batch rewrite item generation failed', {
        ...this.context,
        batchId,
        error,
        itemId,
      });
      return BatchRewriteItemFailureReason.GENERATION_FAILED;
    }
    if (!caption.trim()) return BatchRewriteItemFailureReason.GENERATION_FAILED;

    try {
      await this.reviewService.applyRewrites(
        batchId,
        organizationId,
        userId,
        new Map([[itemId, caption]]),
        postVersions,
        jobId,
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        return BatchRewriteItemFailureReason.CONFLICT;
      }
      throw error;
    }
    return null;
  }

  private async reserveItemCredits(
    data: BatchRewriteJobData,
    jobId: string,
    itemId: string,
  ) {
    const input = {
      actorUserId: data.userId,
      amount: data.credits.amountPerItem,
      brandId: data.brandId,
      expiresAt: new Date(Date.now() + ITEM_RESERVATION_TTL_MS),
      idempotencyKey: `batch-rewrite:${jobId}:${itemId}`,
      organizationId: data.organizationId,
      workloadId: jobId,
      workloadType: 'batch-rewrite',
    };
    const reservation = await this.creditsUtilsService.reserveCredits(input);
    // An earlier attempt at this item failed and released its hold.
    if (
      reservation.status === CreditReservationStatus.RELEASED ||
      reservation.status === CreditReservationStatus.EXPIRED
    ) {
      return this.creditsUtilsService.reserveCredits({
        ...input,
        idempotencyKey: `${input.idempotencyKey}:retry:${randomUUID()}`,
      });
    }
    return reservation;
  }

  private async settleItemCredits(
    data: BatchRewriteJobData,
    jobId: string,
    itemId: string,
    reservationId: string,
  ): Promise<void> {
    // A failure propagates so the job retries: the resumed run finds this
    // job's marker on the item and settles the same hold under the same key.
    await this.creditDeductionQueueService.queueDeduction({
      amount: data.credits.amountPerItem,
      brandId: data.brandId,
      description: data.credits.description,
      idempotencyKey: `batch-rewrite-${jobId}-${itemId}`,
      organizationId: data.organizationId,
      reservationId,
      source: data.credits.source,
      type: 'deduct-credits',
      userId: data.userId,
    });
  }

  private async releaseItemCredits(
    data: BatchRewriteJobData,
    reservationId: string | undefined,
  ): Promise<void> {
    if (!reservationId) return;
    try {
      await this.creditsUtilsService.releaseReservation({
        organizationId: data.organizationId,
        reservationId,
      });
    } catch (error: unknown) {
      this.loggerService.error('Batch rewrite credit release failed', error, {
        ...this.context,
        reservationId,
      });
    }
  }

  private async isCancelRequested(jobId: string): Promise<boolean> {
    const latest = await this.queue.getJob(jobId);
    return latest?.data.isCancelRequested === true;
  }

  private async publish(
    data: BatchRewriteJobData,
    jobId: string,
    status: 'processing' | 'completed' | 'failed',
    progress: IBatchRewriteJobProgress,
    error?: unknown,
  ): Promise<void> {
    const handled =
      progress.completedItemIds.length + progress.failedItems.length;
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: data.activityId,
      error:
        status === 'failed'
          ? error instanceof Error
            ? error.message
            : 'Batch rewrite failed'
          : undefined,
      label: BATCH_REWRITE_TASK_LABEL,
      progress:
        status === 'processing'
          ? Math.min(99, Math.round((handled / data.itemIds.length) * 100))
          : 100,
      room: getUserRoomName(data.userId),
      status,
      taskId: jobId,
      userId: data.userId,
    });
  }
}
