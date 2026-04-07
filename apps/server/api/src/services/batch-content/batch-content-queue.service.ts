import { randomUUID } from 'node:crypto';
import type {
  BatchContentItemJobData,
  BatchContentRequest,
  BatchStatus,
} from '@api/services/batch-content/interfaces/batch-content.interfaces';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ContentDraft } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

interface BatchTracker {
  endedAt?: number;
  startedAt: number;
  status: BatchStatus;
  userId?: string;
}

@Injectable()
export class BatchContentQueueService {
  private readonly context = 'BatchContentQueueService';
  private readonly batchTrackers = new Map<string, BatchTracker>();

  constructor(
    @InjectQueue('batch-content')
    private readonly batchContentQueue: Queue,
    private readonly logger: LoggerService,
    private readonly notificationsPublisherService: NotificationsPublisherService,
  ) {}

  async enqueueBatch(
    request: BatchContentRequest,
    userId?: string,
  ): Promise<{ batchId: string; jobIds: string[] }> {
    const batchId = randomUUID();
    const tracker: BatchTracker = {
      startedAt: Date.now(),
      status: {
        batchId,
        brandId: request.brandId,
        completed: 0,
        failed: 0,
        organizationId: request.organizationId,
        results: [],
        status: 'queued',
        total: request.count,
      },
      userId,
    };

    this.batchTrackers.set(batchId, tracker);

    const jobs = await Promise.all(
      Array.from({ length: request.count }, (_value, index) =>
        this.batchContentQueue.add(
          'batch-item',
          {
            batchId,
            itemIndex: index,
            request,
            userId,
          } satisfies BatchContentItemJobData,
          {
            attempts: 3,
            backoff: { delay: 1000, type: 'exponential' },
            jobId: `${batchId}:${index}`,
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        ),
      ),
    );

    this.logger.log(`${this.context} enqueued batch`, {
      batchId,
      brandId: request.brandId,
      organizationId: request.organizationId,
      total: request.count,
    });

    await this.publishProgress(tracker, 'pending');

    return {
      batchId,
      jobIds: jobs
        .map((job) => job.id)
        .filter((jobId): jobId is string => typeof jobId === 'string'),
    };
  }

  getBatchStatus(
    batchId: string,
    organizationId: string,
    brandId: string,
  ): BatchStatus {
    const tracker = this.batchTrackers.get(batchId);

    if (!tracker) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    if (
      tracker.status.organizationId !== organizationId ||
      tracker.status.brandId !== brandId
    ) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    return {
      ...tracker.status,
      results: [...tracker.status.results],
    };
  }

  async markItemProcessing(batchId: string): Promise<void> {
    const tracker = this.batchTrackers.get(batchId);

    if (!tracker) {
      return;
    }

    tracker.status.status = 'processing';
    await this.publishProgress(tracker, 'processing');
  }

  async markItemCompleted(batchId: string, draft: ContentDraft): Promise<void> {
    const tracker = this.batchTrackers.get(batchId);

    if (!tracker) {
      return;
    }

    tracker.status.completed += 1;
    tracker.status.results.push(draft);

    this.finalizeIfCompleted(tracker);
    await this.publishProgress(tracker, 'completed');
  }

  async markItemFailed(batchId: string): Promise<void> {
    const tracker = this.batchTrackers.get(batchId);

    if (!tracker) {
      return;
    }

    tracker.status.failed += 1;

    this.finalizeIfCompleted(tracker);
    await this.publishProgress(tracker, 'failed');
  }

  getBatchDuration(batchId: string): number {
    const tracker = this.batchTrackers.get(batchId);

    if (!tracker) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    return (tracker.endedAt ?? Date.now()) - tracker.startedAt;
  }

  private finalizeIfCompleted(tracker: BatchTracker): void {
    if (
      tracker.status.completed + tracker.status.failed <
      tracker.status.total
    ) {
      tracker.status.status = 'processing';
      return;
    }

    tracker.endedAt = Date.now();
    tracker.status.status =
      tracker.status.completed > 0 ? 'completed' : 'failed';
  }

  private async publishProgress(
    tracker: BatchTracker,
    status: 'pending' | 'processing' | 'completed' | 'failed',
  ): Promise<void> {
    if (!tracker.userId) {
      return;
    }

    const progress =
      tracker.status.total === 0
        ? 100
        : Math.round(
            ((tracker.status.completed + tracker.status.failed) /
              tracker.status.total) *
              100,
          );

    await this.notificationsPublisherService.publishBackgroundTaskUpdate({
      label: `Batch content ${tracker.status.completed}/${tracker.status.total}`,
      progress,
      room: getUserRoomName(tracker.userId),
      status,
      taskId: tracker.status.batchId,
      userId: tracker.userId,
    });
  }
}
