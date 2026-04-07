import {
  type BatchPipelineConfig,
  ContentOrchestrationService,
  type PipelineConfig,
} from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineJobData } from '@api/services/content-orchestration/content-pipeline-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('content-pipeline', {
  concurrency: 3,
  limiter: { duration: 60000, max: 5 },
})
export class ContentPipelineProcessor extends WorkerHost {
  private readonly logContext = 'ContentPipelineProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly contentOrchestrationService: ContentOrchestrationService,
  ) {
    super();
  }

  async process(job: Job<ContentPipelineJobData>): Promise<unknown> {
    const { data } = job;
    const caller = `${this.logContext} process`;

    this.logger.log(`${caller} starting`, {
      jobName: job.name,
      personaId: data.personaId,
      type: data.type,
    });

    try {
      switch (data.type) {
        case 'generate-and-publish': {
          const config = data.config as PipelineConfig;
          const result =
            await this.contentOrchestrationService.generateAndPublish(config);

          this.logger.log(`${caller} completed`, {
            personaId: data.personaId,
            status: result.status,
            stepCount: result.steps.length,
          });

          return result;
        }

        case 'batch-generate': {
          const config = data.config as BatchPipelineConfig;
          const result =
            await this.contentOrchestrationService.runBatchForPersona(config);

          this.logger.log(`${caller} batch completed`, {
            completed: result.summary.completed,
            failed: result.summary.failed,
            personaId: data.personaId,
            total: result.summary.total,
          });

          return result;
        }

        default:
          throw new Error(`Unknown content pipeline job type: ${data.type}`);
      }
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }
}
