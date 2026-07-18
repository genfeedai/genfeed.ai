import type {
  BatchPipelineConfig,
  PipelineConfig,
} from '@api/services/content-orchestration/content-orchestration.service';
import {
  CONTENT_PIPELINE_QUEUE,
  type ContentPipelineJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Queue } from 'bullmq';

type ContentPipelineJobDataWithConfig = ContentPipelineJobData<
  PipelineConfig | BatchPipelineConfig
>;

@Injectable()
export class ContentqueryQueueService {
  constructor(
    @InjectQueue(CONTENT_PIPELINE_QUEUE)
    private readonly contentqueryQueue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async queueGenerateAndPublish(config: PipelineConfig): Promise<string> {
    const jobOptions: Record<string, unknown> = {};

    // Use idempotencyKey as BullMQ jobId to prevent duplicates on retry
    if (config.idempotencyKey) {
      jobOptions.jobId = config.idempotencyKey;
    }

    const job = await this.contentqueryQueue.add(
      'generate-and-publish',
      {
        config,
        organizationId: config.organizationId,
        personaId: config.personaId,
        type: 'generate-and-publish',
      } satisfies ContentPipelineJobDataWithConfig,
      jobOptions,
    );

    this.logger.log('Queued generate-and-publish job', {
      idempotencyKey: config.idempotencyKey,
      jobId: job.id,
      personaId: config.personaId,
      stepCount: config.steps.length,
    });

    return this.requireJobId(job.id);
  }

  async queueBatchGenerate(config: BatchPipelineConfig): Promise<string> {
    const job = await this.contentqueryQueue.add('batch-generate', {
      config,
      organizationId: config.organizationId,
      personaId: config.personaId,
      type: 'batch-generate',
    } satisfies ContentPipelineJobDataWithConfig);

    this.logger.log('Queued batch-generate job', {
      count: config.count,
      jobId: job.id,
      personaId: config.personaId,
    });

    return this.requireJobId(job.id);
  }

  async getJobsByPersona(
    personaId: string,
    organizationId: string,
  ): Promise<
    Array<{
      id: string;
      status: string;
      type: string;
      createdAt: string;
    }>
  > {
    const jobs = await this.contentqueryQueue.getJobs([
      'active',
      'waiting',
      'delayed',
      'completed',
      'failed',
    ]);

    return jobs
      .filter((job) => {
        const data = job.data as ContentPipelineJobDataWithConfig;
        return (
          data.personaId === personaId && data.organizationId === organizationId
        );
      })
      .slice(0, 50)
      .map((job) => ({
        createdAt: new Date(job.timestamp).toISOString(),
        id: this.requireJobId(job.id),
        status:
          job.returnvalue?.status ?? (job.failedReason ? 'failed' : 'pending'),
        type: (job.data as ContentPipelineJobDataWithConfig).type,
      }));
  }

  private requireJobId(jobId: string | undefined): string {
    if (!jobId) {
      throw new InternalServerErrorException(
        'Content pipeline queue did not return a job id.',
      );
    }
    return jobId;
  }
}

export { ContentqueryQueueService as ContentPipelineQueueService };
