import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import {
  SIGNUP_PREFILL_QUEUE,
  type SignupPrefillJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/**
 * Runs the one-shot brand prefill scheduled when a user signs up: scrape the
 * corporate domain, analyze the brand voice, persist settings/links/banner, and
 * seed the default harness profile so the user's first prompt has a real brand
 * behind it.
 */
@Processor(SIGNUP_PREFILL_QUEUE)
export class SignupPrefillProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly signupPrefillService: SignupPrefillService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'signup-prefill',
      this.logger,
    );
  }

  async process(job: Job<SignupPrefillJobData>): Promise<void> {
    try {
      await this.circuitBreaker.execute(async () => {
        await job.updateProgress(5);
        await this.signupPrefillService.prefillBrand(
          job.data,
          (percent: number) => job.updateProgress(percent),
        );
      });
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
      }

      // Last attempt: leave a terminal marker on the brand so onboarding can
      // tell "prefill failed" apart from "prefill never ran" and offer the
      // interactive setup instead of waiting on a job that will not arrive.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.signupPrefillService.markPrefillFailed(
          job.data.brandId,
          job.data.organizationId,
        );
      }

      throw error;
    }
  }
}
