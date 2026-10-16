import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import {
  BRAND_RELOCATION_QUEUE,
  type BrandRelocationJobData,
} from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(BRAND_RELOCATION_QUEUE, { concurrency: 2 })
export class BrandRelocationProcessor extends WorkerHost {
  constructor(private readonly relocations: BrandRelocationJobsService) {
    super();
  }

  async process(job: Job<BrandRelocationJobData>): Promise<void> {
    await this.relocations.process(
      job.data.operationId,
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
    );
  }
}
