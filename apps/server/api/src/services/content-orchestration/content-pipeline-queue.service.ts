import type {
  BatchPipelineConfig,
  PipelineConfig,
} from '@api/services/content-orchestration/content-orchestration.service';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface ContentqueryJobData {
  type: 'generate-and-publish' | 'batch-generate';
  config: PipelineConfig | BatchPipelineConfig;
  personaId: string;
  organizationId: string;
}

@Injectable()
export class ContentqueryQueueService {
  constructor(
    @InjectQueue('content-pipeline')
    private readonly contentqueryQueue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async queueGenerateAndPublish(config: PipelineConfig): Promise<string> {
    const jobOptions: Record<string, unknown> = {};

    // Use idempotencyKey as BullMQ jobId to prevent duplicates on retry
    if (config.idempotencyKey) {
      jobOptions['jobId'] = config.idempotencyKey;
    }

    const job = await this.contentqueryQueue.add(
      'generate-and-publish',
      {
        config,
        organizationId: config.organizationId,
        personaId: config.personaId,
        type: 'generate-and-publish',
      } satisfies ContentqueryJobData,
      jobOptions,
    );

    this.logger.log('Queued generate-and-publish job', {
      idempotencyKey: config.idempotencyKey,
      jobId: job.id,
      personaId: config.personaId,
      stepCount: config.steps.length,
    });

    return job.id!;
  }

  async queueBatchGenerate(config: BatchPipelineConfig): Promise<string> {
    const job = await this.contentqueryQueue.add('batch-generate', {
      config,
      organizationId: config.organizationId,
      personaId: config.personaId,
      type: 'batch-generate',
    } satisfies ContentqueryJobData);

    this.logger.log('Queued batch-generate job', {
      count: config.count,
      jobId: job.id,
      personaId: config.personaId,
    });

    return job.id!;
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
        const data = job.data as ContentqueryJobData;
        return (
          data.personaId === personaId && data.organizationId === organizationId
        );
      })
      .slice(0, 50)
      .map((job) => ({
        createdAt: new Date(job.timestamp).toISOString(),
        id: job.id!,
        status:
          job.returnvalue?.status ?? (job.failedReason ? 'failed' : 'pending'),
        type: (job.data as ContentqueryJobData).type,
      }));
  }
}
