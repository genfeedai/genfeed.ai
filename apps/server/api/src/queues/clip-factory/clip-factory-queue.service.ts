import type { ClipFactoryJobData } from '@api/queues/clip-factory/clip-factory.constants';
import {
  CLIP_FACTORY_JOB_NAME,
  CLIP_FACTORY_QUEUE,
} from '@api/queues/clip-factory/clip-factory.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class ClipFactoryQueueService {
  private readonly logContext = 'ClipFactoryQueueService';

  constructor(
    @InjectQueue(CLIP_FACTORY_QUEUE) private readonly clipFactoryQueue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(data: ClipFactoryJobData): Promise<string> {
    const job = await this.clipFactoryQueue.add(CLIP_FACTORY_JOB_NAME, data, {
      jobId: `clip-factory-${data.projectId}`,
    });

    this.logger.log(`${this.logContext} enqueued`, {
      jobId: job.id,
      projectId: data.projectId,
      youtubeUrl: data.youtubeUrl,
    });

    return job.id ?? data.projectId;
  }
}
