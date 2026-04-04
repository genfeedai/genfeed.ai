import {
  CLIPPER_JOB_TYPES,
  CLIPPER_QUEUE_NAME,
} from '@clips/queues/clipper-queue.constants';
import { ClipperPipelineService } from '@clips/services/clipper-pipeline.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

interface ClipperJobData {
  projectId: string;
  userId: string;
  organizationId: string;
}

@Processor(CLIPPER_QUEUE_NAME)
export class ClipperProcessor extends WorkerHost {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly clipperPipeline: ClipperPipelineService,
  ) {
    super();
  }

  async process(job: Job<ClipperJobData>): Promise<void> {
    const methodName = `${this.constructorName}.process`;
    this.logger.log(
      `${methodName} Processing job ${job.id}: ${job.name} for project ${job.data.projectId}`,
    );

    try {
      switch (job.name) {
        case CLIPPER_JOB_TYPES.PROCESS_PROJECT:
          await this.clipperPipeline.startPipeline(job.data.projectId);
          break;

        case CLIPPER_JOB_TYPES.RETRY_PROJECT:
          await this.clipperPipeline.retryPipeline(job.data.projectId);
          break;

        default:
          throw new Error(`Unknown clipper job type: ${job.name}`);
      }

      this.logger.log(`${methodName} Job ${job.id} completed successfully`);
    } catch (error: unknown) {
      this.logger.error(`${methodName} Job ${job.id} failed`, error);
      throw error;
    }
  }
}
