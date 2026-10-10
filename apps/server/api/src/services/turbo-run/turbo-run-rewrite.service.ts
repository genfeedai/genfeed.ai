import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  isTerminalRewriteStatus,
  NON_REWRITABLE_POST_STATES,
  TURBO_REWRITE_TASK_LABEL,
  type TurboRewriteJob,
  toTurboRewriteJob,
  turboRewriteDeduplicationId,
} from '@api/services/turbo-run/turbo-rewrite-job.util';
import { resolveTurboRunItems } from '@api/services/turbo-run/turbo-run.types';
import { turboRunItemRowsInclude } from '@api/services/turbo-run/turbo-run-item-rows';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  TurboRewriteJobStatus,
  TurboRunItemStatus,
} from '@genfeedai/contracts';
import type { ITurboRewriteJob } from '@genfeedai/contracts/interfaces';
import {
  TURBO_REWRITE_QUEUE,
  type TurboRewriteJobCredits,
  type TurboRewriteJobData,
  type TurboRewriteJobResult,
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
 * Admits a Review run rewrite and hands it to the `turbo-rewrite` queue
 * (#5365). The request returns a job id immediately; the workers app runs the
 * rewrites (`TurboRunRewriteRunnerService`) and reports progress over
 * the user's websocket room.
 */
@Injectable()
export class TurboRunRewriteService {
  constructor(
    @InjectQueue(TURBO_REWRITE_QUEUE)
    private readonly queue: Queue<TurboRewriteJobData, TurboRewriteJobResult>,
    private readonly prisma: PrismaService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async enqueue(input: {
    turboRunId: string;
    credits: TurboRewriteJobCredits;
    itemIds: string[];
    organizationId: string;
    userId: string;
  }): Promise<ITurboRewriteJob> {
    const { turboRunId, organizationId, userId } = input;
    const itemIds = [...new Set(input.itemIds)];
    const { brandId, postVersions } = await this.loadSelection(
      turboRunId,
      itemIds,
      organizationId,
    );
    if (await this.findActiveJob(turboRunId, organizationId)) {
      throw new ConflictException('A rewrite is already running for this run');
    }

    const activity = await this.activityRecorder.record({
      brandId,
      key: ActivityKey.POST_PROCESSING,
      organizationId,
      source: ActivitySource.POST_ENHANCEMENT,
      userId,
      value: JSON.stringify({ turboRunId, itemIds, type: 'turbo-rewrite' }),
    });
    const jobId = `turbo-rewrite-${turboRunId}-${randomUUID()}`;
    const job = await this.queue.add(
      'rewrite-items',
      {
        activityId: activity.id,
        turboRunId,
        brandId,
        credits: input.credits,
        itemIds,
        organizationId,
        postVersions,
        userId,
      },
      { deduplication: { id: turboRewriteDeduplicationId(turboRunId) }, jobId },
    );
    if (job.id !== jobId) {
      // Another request queued a rewrite between the check above and add().
      // The duplicate request never ran: keep the history row, raise no alert.
      await this.activityRecorder.update(activity, {
        alert: { channels: [] },
        key: ActivityKey.POST_FAILED,
        source: ActivitySource.POST_ENHANCEMENT,
      });
      throw new ConflictException('A rewrite is already running for this run');
    }

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id,
      label: TURBO_REWRITE_TASK_LABEL,
      progress: 0,
      room: getUserRoomName(userId),
      status: 'pending',
      taskId: jobId,
      userId,
    });

    return {
      turboRunId,
      completedItemIds: [],
      failedItems: [],
      id: jobId,
      isCancelRequested: false,
      itemIds,
      status: TurboRewriteJobStatus.QUEUED,
    };
  }

  async getJob(
    turboRunId: string,
    jobId: string,
    organizationId: string,
  ): Promise<ITurboRewriteJob> {
    return toTurboRewriteJob(
      await this.getOwnedJob(turboRunId, jobId, organizationId),
    );
  }

  /** The run's queued or running rewrite, so a reloaded page can resume it. */
  async getActiveJob(
    turboRunId: string,
    organizationId: string,
  ): Promise<ITurboRewriteJob | null> {
    return this.findActiveJob(turboRunId, organizationId);
  }

  /**
   * Stops the rewrite before its next item. Items already rewritten keep their
   * new caption and their charge; the rest are never generated or billed.
   */
  async cancel(
    turboRunId: string,
    jobId: string,
    organizationId: string,
  ): Promise<ITurboRewriteJob> {
    const job = await this.getOwnedJob(turboRunId, jobId, organizationId);
    const current = await toTurboRewriteJob(job);
    if (isTerminalRewriteStatus(current.status) || current.isCancelRequested) {
      return current;
    }
    await job.updateData({ ...job.data, isCancelRequested: true });
    return { ...current, isCancelRequested: true };
  }

  private async findActiveJob(
    turboRunId: string,
    organizationId: string,
  ): Promise<ITurboRewriteJob | null> {
    const jobId = await this.queue.getDeduplicationJobId(
      turboRewriteDeduplicationId(turboRunId),
    );
    const job = jobId ? await this.queue.getJob(jobId) : undefined;
    if (!job || job.data.organizationId !== organizationId) return null;
    const current = await toTurboRewriteJob(job);
    return isTerminalRewriteStatus(current.status) ? null : current;
  }

  /** Job ids are global in Redis; the tenant check is what scopes them. */
  private async getOwnedJob(
    turboRunId: string,
    jobId: string,
    organizationId: string,
  ): Promise<TurboRewriteJob> {
    const job = await this.queue.getJob(jobId);
    if (
      !job ||
      job.data.organizationId !== organizationId ||
      job.data.turboRunId !== turboRunId
    ) {
      throw new NotFoundException('Turbo rewrite', jobId);
    }
    return job;
  }

  private async loadSelection(
    turboRunId: string,
    itemIds: string[],
    organizationId: string,
  ): Promise<{ brandId: string; postVersions: Record<string, string> }> {
    const turboRun = await this.prisma.turboRun.findFirst({
      include: turboRunItemRowsInclude(organizationId),
      where: { id: turboRunId, organizationId, isDeleted: false },
    });
    if (!turboRun) throw new NotFoundException('Turbo run', turboRunId);
    // Posts always belong to a brand, and the rewrite uses its voice: a
    // brandless run has nothing it could rewrite.
    const brandId = turboRun.brandId;
    if (!brandId) {
      throw new BadRequestException('Rewrite needs a brand-scoped run');
    }
    const selectedIds = new Set(itemIds);
    const items = resolveTurboRunItems(turboRun).filter((item) =>
      selectedIds.has(item.id),
    );
    if (
      !items.length ||
      items.length !== selectedIds.size ||
      items.some((item) => item.status !== TurboRunItemStatus.COMPLETED)
    ) {
      throw new BadRequestException('Select completed items from this run');
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
