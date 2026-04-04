import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface ContentOptimizationJobData {
  type: 'analyze' | 'optimize-prompt';
  organizationId: string;
  brandId: string;
  prompt?: string;
}

@Injectable()
export class ContentOptimizationQueueService {
  constructor(
    @InjectQueue('content-optimization')
    private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async queueAnalysis(
    organizationId: string,
    brandId: string,
  ): Promise<string> {
    const job = await this.queue.add('analyze', {
      brandId,
      organizationId,
      type: 'analyze',
    } satisfies ContentOptimizationJobData);

    this.logger.log('Queued content-optimization analyze job', {
      brandId,
      jobId: job.id,
    });

    return job.id!;
  }

  async queuePromptOptimization(
    organizationId: string,
    brandId: string,
    prompt: string,
  ): Promise<string> {
    const job = await this.queue.add('optimize-prompt', {
      brandId,
      organizationId,
      prompt,
      type: 'optimize-prompt',
    } satisfies ContentOptimizationJobData);

    this.logger.log('Queued content-optimization prompt job', {
      brandId,
      jobId: job.id,
    });

    return job.id!;
  }

  async getJobStatus(
    jobId: string,
  ): Promise<{ id: string; status: string; result?: unknown }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { id: jobId, status: 'not_found' };
    }

    const state = await job.getState();
    return {
      id: job.id!,
      result: job.returnvalue ?? undefined,
      status: state,
    };
  }
}
