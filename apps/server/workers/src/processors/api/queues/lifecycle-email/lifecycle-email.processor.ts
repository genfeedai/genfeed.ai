import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import {
  LIFECYCLE_EMAIL_QUEUE,
  type LifecycleEmailJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(LIFECYCLE_EMAIL_QUEUE)
export class LifecycleEmailProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly lifecycleEmailService: LifecycleEmailService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'lifecycle-email',
      this.logger,
    );
  }

  async process(job: Job<LifecycleEmailJobData>): Promise<void> {
    try {
      await this.circuitBreaker.execute(async () => {
        await job.updateProgress(10);
        await this.lifecycleEmailService.sendLifecycleEmail(job.data);
        await job.updateProgress(100);
      });
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
      }
      throw error;
    }
  }
}
