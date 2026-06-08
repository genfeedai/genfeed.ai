import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';
import { ContentOptimizationJobData } from '@api/services/content-optimization/content-optimization-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('content-optimization', {
  concurrency: 2,
  limiter: { duration: 60000, max: 5 },
})
export class ContentOptimizationProcessor extends WorkerHost {
  private readonly logContext = 'ContentOptimizationProcessor';
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 5;
  private circuitOpen = false;
  private circuitOpenedAt = 0;
  private readonly circuitResetMs = 5 * 60 * 1000; // 5 min

  constructor(
    private readonly logger: LoggerService,
    private readonly contentOptimizationService: ContentOptimizationService,
  ) {
    super();
  }

  async process(job: Job<ContentOptimizationJobData>): Promise<unknown> {
    const { data } = job;
    const caller = `${this.logContext}.process`;

    // Circuit breaker check
    if (this.circuitOpen) {
      if (Date.now() - this.circuitOpenedAt > this.circuitResetMs) {
        this.logger.log(`${caller} circuit half-open, retrying`);
        this.circuitOpen = false;
        this.consecutiveFailures = 0;
      } else {
        this.logger.warn(`${caller} circuit open, skipping job ${job.id}`);
        throw new Error('Circuit breaker open — too many consecutive failures');
      }
    }

    this.logger.log(`${caller} starting`, {
      brandId: data.brandId,
      jobName: job.name,
      type: data.type,
    });

    try {
      let result: unknown;

      switch (data.type) {
        case 'analyze': {
          result = await this.contentOptimizationService.analyzePerformance(
            data.organizationId,
            data.brandId,
          );
          break;
        }

        case 'optimize-prompt': {
          if (!data.prompt) {
            throw new Error('Prompt is required for optimize-prompt jobs');
          }
          result = await this.contentOptimizationService.optimizePrompt(
            data.organizationId,
            data.brandId,
            data.prompt,
          );
          break;
        }

        default:
          throw new Error(
            `Unknown content-optimization job type: ${data.type}`,
          );
      }

      this.consecutiveFailures = 0;
      this.logger.log(`${caller} completed`, {
        brandId: data.brandId,
        type: data.type,
      });

      return result;
    } catch (error: unknown) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.circuitOpen = true;
        this.circuitOpenedAt = Date.now();
        this.logger.error(
          `${caller} circuit OPEN after ${this.consecutiveFailures} failures`,
          error,
        );
      } else {
        this.logger.error(`${caller} failed`, error);
      }
      throw error;
    }
  }
}
