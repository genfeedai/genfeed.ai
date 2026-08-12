import {
  ANALYTICS_YOUTUBE_QUEUE,
  YouTubeAnalyticsJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { AnalyticsYouTubeJobService } from '@server/analytics/services/analytics-youtube-job.service';
import { ANALYTICS_JOB_LIMITER } from '@workers/processors/api/queues/shared/analytics-queue-limiters';
import { Job } from 'bullmq';

@Processor(ANALYTICS_YOUTUBE_QUEUE, { limiter: ANALYTICS_JOB_LIMITER })
export class AnalyticsYouTubeProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly analyticsYouTubeJobService: AnalyticsYouTubeJobService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-youtube',
      this.logger,
    );
  }

  async process(job: Job<YouTubeAnalyticsJobData>): Promise<void> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(error.message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<YouTubeAnalyticsJobData>,
  ): Promise<void> {
    await this.analyticsYouTubeJobService.process(job);
  }
}
