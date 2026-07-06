import {
  ANALYTICS_SOCIAL_QUEUE,
  SocialAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { AnalyticsSocialJobService } from '@server-domain/analytics/services/analytics-social-job.service';
import { Job } from 'bullmq';

@Processor(ANALYTICS_SOCIAL_QUEUE)
export class AnalyticsSocialProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly analyticsSocialJobService: AnalyticsSocialJobService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-social',
      this.logger,
    );
  }

  async process(job: Job<SocialAnalyticsJobData>): Promise<void> {
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
    job: Job<SocialAnalyticsJobData>,
  ): Promise<void> {
    await this.analyticsSocialJobService.process(job);
  }
}
