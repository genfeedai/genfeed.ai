import {
  CLIP_ANALYZE_JOB_NAME,
  CLIP_ANALYZE_QUEUE,
  ClipAnalyzeJobData,
} from '@api/queues/clip-analyze/clip-analyze.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
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
      youtubeUrl: data.youtubeUrl,
    });

    return job.id ?? data.projectId;
  }
}
