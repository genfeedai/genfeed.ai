import { InsightsService } from '@api/collections/insights/services/insights.service';
import {
  INSIGHT_GENERATION_QUEUE,
  type InsightGenerationJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(INSIGHT_GENERATION_QUEUE)
export class InsightGenerationProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly insightsService: InsightsService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'insight-generation',
      this.logger,
    );
  }

  async process(job: Job<InsightGenerationJobData>): Promise<void> {
    try {
      await this.circuitBreaker.execute(async () => {
        await this.insightsService.generateInsightsIfNeeded(
          job.data.organizationId,
          job.data.limit,
        );
      });
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
      }

      throw error;
    }
  }
}
