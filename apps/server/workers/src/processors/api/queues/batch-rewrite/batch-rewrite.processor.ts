import { BatchGenerationRewriteRunnerService } from '@api/services/batch-generation/batch-generation-rewrite-runner.service';
import {
  BATCH_REWRITE_QUEUE,
  type BatchRewriteJobData,
  type BatchRewriteJobResult,
} from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/** Each job runs its items sequentially; concurrency spreads users' jobs. */
@Processor(BATCH_REWRITE_QUEUE, { concurrency: 4 })
export class BatchRewriteProcessor extends WorkerHost {
  constructor(
    private readonly batchRewriteRunner: BatchGenerationRewriteRunnerService,
  ) {
    super();
  }

  async process(
    job: Job<BatchRewriteJobData, BatchRewriteJobResult>,
  ): Promise<BatchRewriteJobResult> {
    return this.batchRewriteRunner.run(job);
  }
}
