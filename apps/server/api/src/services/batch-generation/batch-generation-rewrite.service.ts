import { randomUUID } from 'node:crypto';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveBatchItems } from '@api/services/batch-generation/batch-generation.types';
import { batchItemRowsInclude } from '@api/services/batch-generation/batch-item-rows';
import {
  BATCH_REWRITE_TASK_LABEL,
  type BatchRewriteJob,
  batchRewriteDeduplicationId,
  isTerminalRewriteStatus,
  NON_REWRITABLE_POST_STATES,
  toBatchRewriteJob,
} from '@api/services/batch-generation/batch-rewrite-job.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  BatchItemStatus,
  BatchRewriteJobStatus,
} from '@genfeedai/contracts';
import type { IBatchRewriteJob } from '@genfeedai/contracts/interfaces';
import {
  BATCH_REWRITE_QUEUE,
  type BatchRewriteJobCredits,
  type BatchRewriteJobData,
  type BatchRewriteJobResult,
} from '@genfeedai/contracts/queue';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * Admits a Review batch rewrite and hands it to the `batch-rewrite` queue
 * (#5365). The request returns a job id immediately; the workers app runs the
 * rewrites (`BatchGenerationRewriteRunnerService`) and reports progress over
 * the user's websocket room.
 */
@Injectable()
export class BatchGenerationRewriteService {
  constructor(
    @InjectQueue(BATCH_REWRITE_QUEUE)
    private readonly queue: Queue<BatchRewriteJobData, BatchRewriteJobResult>,
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async enqueue(input: {
    batchId: string;
    credits: BatchRewriteJobCredits;
    itemIds: string[];
    organizationId: string;
    userId: string;
  }): Promise<IBatchRewriteJob> {
    const { batchId, organizationId, userId } = input;
    const itemIds = [...new Set(input.itemIds)];
    const { brandId, postVersions } = await this.loadSelection(
      batchId,
      itemIds,
      organizationId,
    );
    if (await this.findActiveJob(batchId, organizationId)) {
      throw new ConflictException(
        'A rewrite is already running for this batch',
      );
    }

    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId,
        organizationId,
        userId,
        key: ActivityKey.POST_PROCESSING,
        source: ActivitySource.POST_ENHANCEMENT,
        value: JSON.stringify({ batchId, itemIds, type: 'batch-rewrite' }),
      }),
    );
    const jobId = `batch-rewrite-${batchId}-${randomUUID()}`;
    const job = await this.queue.add(
      'rewrite-items',
      {
        activityId: activity.id,
        batchId,
        brandId,
        credits: input.credits,
        itemIds,
        organizationId,
        postVersions,
        userId,
      },
      { deduplication: { id: batchRewriteDeduplicationId(batchId) }, jobId },
    );
    if (job.id !== jobId) {
      // Another request queued a rewrite between the check above and add().
      await this.activitiesService.patch(activity.id, {
        key: ActivityKey.POST_FAILED,
        source: ActivitySource.POST_ENHANCEMENT,
        organizationId,
      });
      throw new ConflictException(
        'A rewrite is already running for this batch',
      );
    }

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id,
      label: BATCH_REWRITE_TASK_LABEL,
      progress: 0,
      room: getUserRoomName(userId),
      status: 'pending',
      taskId: jobId,
      userId,
    });

    return {
      batchId,
      completedItemIds: [],
      failedItems: [],
      id: jobId,
      isCancelRequested: false,
      itemIds,
      status: BatchRewriteJobStatus.QUEUED,
    };
  }

  async getJob(
    batchId: string,
    jobId: string,
    organizationId: string,
  ): Promise<IBatchRewriteJob> {
    return toBatchRewriteJob(
      await this.getOwnedJob(batchId, jobId, organizationId),
    );
  }

  /** The batch's queued or running rewrite, so a reloaded page can resume it. */
  async getActiveJob(
    batchId: string,
    organizationId: string,
  ): Promise<IBatchRewriteJob | null> {
    return this.findActiveJob(batchId, organizationId);
  }

  /**
   * Stops the rewrite before its next item. Items already rewritten keep their
   * new caption and their charge; the rest are never generated or billed.
   */
  async cancel(
    batchId: string,
    jobId: string,
    organizationId: string,
  ): Promise<IBatchRewriteJob> {
    const job = await this.getOwnedJob(batchId, jobId, organizationId);
    const current = await toBatchRewriteJob(job);
    if (isTerminalRewriteStatus(current.status) || current.isCancelRequested) {
      return current;
    }
    await job.updateData({ ...job.data, isCancelRequested: true });
    return { ...current, isCancelRequested: true };
  }

  private async findActiveJob(
    batchId: string,
    organizationId: string,
  ): Promise<IBatchRewriteJob | null> {
    const jobId = await this.queue.getDeduplicationJobId(
      batchRewriteDeduplicationId(batchId),
    );
    const job = jobId ? await this.queue.getJob(jobId) : undefined;
    if (!job || job.data.organizationId !== organizationId) return null;
    const current = await toBatchRewriteJob(job);
    return isTerminalRewriteStatus(current.status) ? null : current;
  }

  /** Job ids are global in Redis; the tenant check is what scopes them. */
  private async getOwnedJob(
    batchId: string,
    jobId: string,
    organizationId: string,
  ): Promise<BatchRewriteJob> {
    const job = await this.queue.getJob(jobId);
    if (
      !job ||
      job.data.organizationId !== organizationId ||
      job.data.batchId !== batchId
    ) {
      throw new NotFoundException('Batch rewrite', jobId);
    }
    return job;
  }

  private async loadSelection(
    batchId: string,
    itemIds: string[],
    organizationId: string,
  ): Promise<{ brandId: string; postVersions: Record<string, string> }> {
    const batch = await this.prisma.batch.findFirst({
      include: batchItemRowsInclude(organizationId),
      where: { id: batchId, organizationId, isDeleted: false },
    });
    if (!batch) throw new NotFoundException('Batch', batchId);
    // Posts always belong to a brand, and the rewrite uses its voice: a
    // brandless batch has nothing it could rewrite.
    const brandId = batch.brandId;
    if (!brandId) {
      throw new BadRequestException('Rewrite needs a brand-scoped batch');
    }
    const selectedIds = new Set(itemIds);
    const items = resolveBatchItems(batch).filter((item) =>
      selectedIds.has(item.id),
    );
    if (
      !items.length ||
      items.length !== selectedIds.size ||
      items.some((item) => item.status !== BatchItemStatus.COMPLETED)
    ) {
      throw new BadRequestException('Select completed items from this batch');
    }
    const postIds = items.flatMap((item) => (item.postId ? [item.postId] : []));
    const posts = await this.prisma.post.findMany({
      where: { id: { in: postIds }, organizationId, isDeleted: false, brandId },
    });
    const postMap = new Map(posts.map((post) => [post.id, post]));
    const postVersions: Record<string, string> = {};
    for (const postId of postIds) {
      const post = postMap.get(postId);
      if (!post) throw new NotFoundException('Post', postId);
      if (NON_REWRITABLE_POST_STATES.has(post.targetExecutionState)) {
        throw new BadRequestException('This post can no longer be rewritten');
      }
      postVersions[postId] = post.updatedAt.toISOString();
    }
    return { brandId, postVersions };
  }
}
