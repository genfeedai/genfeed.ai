import {
  REPLICATE_POLL_DELAY_MS,
  REPLICATE_POLL_QUEUE,
  type ReplicatePollJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class ReplicatePollQueueService {
  private readonly logContext = ReplicatePollQueueService.name;

  constructor(
    @InjectQueue(REPLICATE_POLL_QUEUE)
    @Optional()
    private readonly queue: Queue<ReplicatePollJobData>,
    private readonly logger: LoggerService,
  ) {}

  async schedule(
    data: Omit<ReplicatePollJobData, 'attempt'> & { attempt?: number },
    delayMs: number = REPLICATE_POLL_DELAY_MS,
  ): Promise<string | undefined> {
    if (!this.queue) {
      this.logger.warn(
        `${this.logContext}: queue not available, skipping schedule`,
      );
      return undefined;
    }

    const attempt = data.attempt ?? 1;
    const job = await this.queue.add(
      'poll-replicate-generation',
      { ...data, attempt },
      {
        attempts: 2,
        backoff: { delay: 5_000, type: 'exponential' },
        delay: delayMs,
        jobId: `replicate-poll-${data.ingredientId}-${attempt}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log(`${this.logContext}: scheduled poll attempt ${attempt}`, {
      delayMs,
      externalId: data.externalId,
      ingredientId: data.ingredientId,
      jobId: job.id,
    });
    return job.id ?? undefined;
  }
}
