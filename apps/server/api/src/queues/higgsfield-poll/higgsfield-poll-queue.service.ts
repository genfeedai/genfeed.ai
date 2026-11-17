import {
  HIGGSFIELD_POLL_DELAY_MS,
  HIGGSFIELD_POLL_QUEUE,
  type HiggsFieldPollJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * Schedules the durable poll of an accepted Higgsfield video request. The job
 * id is fixed per ingredient and attempt, so scheduling the same attempt twice
 * (a retried submission that returned the same request) adds one job.
 */
@Traced()
@Injectable()
export class HiggsFieldPollQueueService {
  private readonly logContext = HiggsFieldPollQueueService.name;

  constructor(
    @InjectQueue(HIGGSFIELD_POLL_QUEUE)
    @Optional()
    private readonly queue: Queue<HiggsFieldPollJobData>,
    private readonly logger: LoggerService,
  ) {}

  async schedule(
    data: Omit<HiggsFieldPollJobData, 'attempt'> & { attempt?: number },
    delayMs: number = HIGGSFIELD_POLL_DELAY_MS,
  ): Promise<string | undefined> {
    if (!this.queue) {
      this.logger.warn(
        `${this.logContext}: queue not available, skipping schedule`,
      );
      return undefined;
    }

    const attempt = data.attempt ?? 1;
    const job = await this.queue.add(
      'poll-higgsfield-video',
      { ...data, attempt },
      {
        attempts: 2,
        backoff: { delay: 5_000, type: 'exponential' },
        delay: delayMs,
        jobId: `higgsfield-poll-${data.ingredientId}-${attempt}`,
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
