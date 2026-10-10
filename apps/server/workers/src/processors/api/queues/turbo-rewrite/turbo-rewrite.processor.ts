import { TurboRunRewriteRunnerService } from '@api/services/turbo-run/turbo-run-rewrite-runner.service';
import {
  TURBO_REWRITE_QUEUE,
  type TurboRewriteJobData,
  type TurboRewriteJobResult,
} from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/** Each job runs its items sequentially; concurrency spreads users' jobs. */
@Processor(TURBO_REWRITE_QUEUE, { concurrency: 4 })
export class TurboRewriteProcessor extends WorkerHost {
  constructor(
    private readonly turboRewriteRunner: TurboRunRewriteRunnerService,
  ) {
    super();
  }

  async process(
    job: Job<TurboRewriteJobData, TurboRewriteJobResult>,
  ): Promise<TurboRewriteJobResult> {
    return this.turboRewriteRunner.run(job);
  }
}
