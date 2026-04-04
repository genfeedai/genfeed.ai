import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { RedisService } from '@libs/redis/redis.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';

/**
 * JobLifecyclePublisherService
 *
 * Listens to BullMQ job lifecycle events (waiting, active, completed, failed, etc.)
 * and publishes them to Redis channels for the notification service and frontend.
 */
@Injectable()
export class JobLifecyclePublisherService implements OnModuleInit {
  private readonly logger = new Logger(JobLifecyclePublisherService.name);
  private queueEvents: QueueEvents[] = [];

  constructor(
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_NAMES.TASK_PROCESSING)
    private readonly taskQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VIDEO_PROCESSING)
    private readonly videoQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMAGE_PROCESSING)
    private readonly imageQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FILE_PROCESSING)
    private readonly fileQueue: Queue,
  ) {}

  onModuleInit() {
    this.setupQueueListeners(this.taskQueue, 'task');
    this.setupQueueListeners(this.videoQueue, 'video');
    this.setupQueueListeners(this.imageQueue, 'image');
    this.setupQueueListeners(this.fileQueue, 'file');

    this.logger.log('Job lifecycle event listeners initialized');
  }

  private setupQueueListeners(queue: Queue, queueType: string) {
    // Create QueueEvents instance for this queue
    const queueEvents = new QueueEvents(queue.name, {
      connection: queue.opts.connection,
    });

    // Listen for job lifecycle events
    queueEvents.on('waiting', ({ jobId }) => {
      void this.publishJobEvent(queueType, jobId, 'waiting');
    });

    queueEvents.on('active', ({ jobId, prev }) => {
      void this.publishJobEvent(queueType, jobId, 'active', { prev });
    });

    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      void this.publishJobEvent(queueType, jobId, 'completed', { returnvalue });
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      void this.publishJobEvent(queueType, jobId, 'failed', { failedReason });
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      void this.publishJobEvent(queueType, jobId, 'progress', {
        progress: data,
      });
    });

    queueEvents.on('stalled', ({ jobId }) => {
      void this.publishJobEvent(queueType, jobId, 'stalled');
    });

    queueEvents.on('removed', ({ jobId }) => {
      void this.publishJobEvent(queueType, jobId, 'removed');
    });

    // Store reference to prevent garbage collection
    this.queueEvents.push(queueEvents);

    this.logger.log(`Event listeners for ${queueType} queue initialized`);
  }

  async publishJobEvent(
    queueType: string,
    jobId: string,
    status: string,
    additionalData?: unknown,
  ) {
    try {
      const payload = {
        jobId,
        queueType,
        status,
        timestamp: new Date().toISOString(),
        ...additionalData,
      };

      // Publish to Redis channel
      const channel = `job-lifecycle:${queueType}`;
      await this.redisService.publish(channel, JSON.stringify(payload));

      this.logger.debug(
        `Published ${status} event for job ${jobId} in ${queueType} queue`,
      );
    } catch (error: unknown) {
      this.logger.error(`Failed to publish job event: ${error}`);
    }
  }

  async onModuleDestroy() {
    // Clean up QueueEvents instances
    await Promise.all(this.queueEvents.map((events) => events.close()));
    this.queueEvents = [];
  }
}
