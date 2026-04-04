import { BatchContentQueueService } from '@api/services/batch-content/batch-content-queue.service';
import type { BatchContentItemJobData } from '@api/services/batch-content/interfaces/batch-content.interfaces';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('batch-content', {
  concurrency: 10,
  limiter: { duration: 60000, max: 30 },
})
export class BatchContentProcessor extends WorkerHost {
  private readonly context = 'BatchContentProcessor';

  constructor(
    private readonly skillExecutorService: SkillExecutorService,
    private readonly batchContentQueueService: BatchContentQueueService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<BatchContentItemJobData>): Promise<unknown> {
    await this.batchContentQueueService.markItemProcessing(job.data.batchId);

    try {
      const execution = await this.skillExecutorService.execute({
        brandId: job.data.request.brandId,
        organizationId: job.data.request.organizationId,
        params: job.data.request.params,
        skillSlug: job.data.request.skillSlug,
      });

      await this.batchContentQueueService.markItemCompleted(
        job.data.batchId,
        execution.draft,
      );

      return execution.draft;
    } catch (error: unknown) {
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      if (isFinalAttempt) {
        await this.batchContentQueueService.markItemFailed(job.data.batchId);
      }

      this.logger.error(`${this.context} job failed`, {
        attemptsMade: job.attemptsMade,
        batchId: job.data.batchId,
        error: error instanceof Error ? error.message : String(error),
        itemIndex: job.data.itemIndex,
      });

      throw error;
    }
  }
}
