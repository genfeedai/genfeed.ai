import type { AccountGenerationJobData } from '@api/collections/posts/services/post-account-generation-job.types';
import { PostAccountGenerationRunnerService } from '@api/collections/posts/services/post-account-generation-runner.service';
import { ACCOUNT_GENERATION_QUEUE } from '@genfeedai/contracts/queue';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(ACCOUNT_GENERATION_QUEUE, {
  concurrency: 2,
  limiter: { duration: 60_000, max: 12 },
  maxStalledCount: 0,
})
export class AccountGenerationProcessor extends WorkerHost {
  constructor(private readonly generation: PostAccountGenerationRunnerService) {
    super();
  }

  async process(job: Job<AccountGenerationJobData>): Promise<void> {
    await this.generation.process(job.data);
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<AccountGenerationJobData> | undefined,
  ): Promise<void> {
    if (job) await this.generation.fail(job.data);
  }
}
