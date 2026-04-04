import {
  CLIPPER_JOB_TYPES,
  CLIPPER_QUEUE_NAME,
} from '@clips/queues/clipper-queue.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

interface ClipperJobData {
  projectId: string;
  userId: string;
  organizationId: string;
}

@Injectable()
export class ClipperQueueService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    @InjectQueue(CLIPPER_QUEUE_NAME)
    private readonly clipperQueue: Queue<ClipperJobData>,
    private readonly logger: LoggerService,
  ) {}

  async addProcessJob(
    projectId: string,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const methodName = `${this.constructorName}.addProcessJob`;
    this.logger.log(`${methodName} Queuing project: ${projectId}`);

    const job = await this.clipperQueue.add(
      CLIPPER_JOB_TYPES.PROCESS_PROJECT,
      { organizationId, projectId, userId },
      {
        jobId: `clipper-${projectId}-${Date.now()}`,
        removeOnComplete: 50,
        removeOnFail: 25,
      },
    );

    return job.id as string;
  }

  async addRetryJob(
    projectId: string,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const methodName = `${this.constructorName}.addRetryJob`;
    this.logger.log(`${methodName} Queuing retry for project: ${projectId}`);

    const job = await this.clipperQueue.add(
      CLIPPER_JOB_TYPES.RETRY_PROJECT,
      { organizationId, projectId, userId },
      {
        jobId: `clipper-retry-${projectId}-${Date.now()}`,
        removeOnComplete: 50,
        removeOnFail: 25,
      },
    );

    return job.id as string;
  }
}
