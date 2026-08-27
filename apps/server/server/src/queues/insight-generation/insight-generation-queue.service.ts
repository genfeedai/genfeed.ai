import {
  INSIGHT_GENERATION_JOB_NAME,
  INSIGHT_GENERATION_QUEUE,
  type InsightGenerationJobData,
} from '@genfeedai/queue-contracts';
import { reserveIdempotentJob } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';

export function insightGenerationJobId(organizationId: string): string {
  // BullMQ custom ids reject `:`. Keep the org lease in one hyphenated token.
  return `insight-generate-${organizationId}`;
}

@Injectable()
export class InsightGenerationQueueService {
  constructor(
    private readonly logger: LoggerService,
    @InjectQueue(INSIGHT_GENERATION_QUEUE)
    @Optional()
    private readonly queue?: Queue<InsightGenerationJobData>,
  ) {}

  /**
   * One in-flight fill per org. A refresh storm reuses the same lease instead
   * of starting a second LLM generation.
   */
  async enqueueGeneration(
    data: InsightGenerationJobData,
  ): Promise<string | null> {
    if (!this.queue) {
      this.logger.warn('Insight generation queue unavailable', {
        organizationId: data.organizationId,
      });
      return null;
    }

    const jobId = insightGenerationJobId(data.organizationId);
    const reservation = await reserveIdempotentJob(this.queue, jobId);
    if (reservation.alreadyQueued) {
      return jobId;
    }

    const job = await this.queue.add(INSIGHT_GENERATION_JOB_NAME, data, {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log('Queued insight generation', {
      jobId: job.id ?? jobId,
      organizationId: data.organizationId,
    });

    return job.id ?? jobId;
  }
}
