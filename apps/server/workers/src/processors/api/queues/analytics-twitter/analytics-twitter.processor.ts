import {
  ANALYTICS_TWITTER_QUEUE,
  TwitterAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { AnalyticsTwitterJobService } from '@server/analytics/services/analytics-twitter-job.service';
import { Job } from 'bullmq';

@Processor(ANALYTICS_TWITTER_QUEUE)
export class AnalyticsTwitterProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly analyticsTwitterJobService: AnalyticsTwitterJobService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-twitter',
      this.logger,
    );
  }

  async process(job: Job<TwitterAnalyticsJobData>): Promise<void> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<TwitterAnalyticsJobData>,
  ): Promise<void> {
    await this.analyticsTwitterJobService.process(job);
  }
}
