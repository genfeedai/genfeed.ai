import {
  LIFECYCLE_EMAIL_QUEUE,
  type LifecycleEmailJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class LifecycleEmailQueueService {
  private readonly context = { service: LifecycleEmailQueueService.name };

  constructor(
    @InjectQueue(LIFECYCLE_EMAIL_QUEUE)
    private readonly queue: Queue<LifecycleEmailJobData>,
    private readonly logger: LoggerService,
  ) {}

  async scheduleEmail(
    data: LifecycleEmailJobData,
    scheduledFor: Date,
  ): Promise<void> {
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    const jobId = [
      'lifecycle-email',
      data.userId,
      data.sequence,
      data.step,
      data.triggerKey,
    ].join(':');

    await this.queue.add('send-lifecycle-email', data, {
      delay,
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log('Lifecycle email job scheduled', {
      ...this.context,
      jobId,
      scheduledFor: scheduledFor.toISOString(),
      sequence: data.sequence,
      step: data.step,
      userId: data.userId,
    });
  }
}
