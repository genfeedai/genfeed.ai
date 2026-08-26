import type { ClipSourceContract } from '@genfeedai/interfaces';
import {
  CLIP_ANALYZE_JOB_NAME,
  CLIP_ANALYZE_QUEUE,
  ClipAnalyzeJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class ClipAnalyzeQueueService {
  private readonly logContext = 'ClipAnalyzeQueueService';

  constructor(
    @InjectQueue(CLIP_ANALYZE_QUEUE) private readonly clipAnalyzeQueue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(data: ClipAnalyzeJobData): Promise<string> {
    const job = await this.clipAnalyzeQueue.add(CLIP_ANALYZE_JOB_NAME, data, {
      jobId: `clip-analyze-${data.projectId}`,
    });

    this.logger.log(`${this.logContext} enqueued`, {
      jobId: job.id,
      projectId: data.projectId,
    });

    return job.id ?? data.projectId;
  }

  async retry(projectId: string, source: ClipSourceContract): Promise<string> {
    const jobId = `clip-analyze-${projectId}`;
    const job = await this.clipAnalyzeQueue.getJob(jobId);
    if (!job || (await job.getState()) !== 'failed') {
      throw new BadRequestException(
        `Failed clip analysis job ${jobId} was not found`,
      );
    }

    await job.updateData({ ...job.data, source });
    await job.retry();
    return job.id ?? jobId;
  }
}
