import {
  POST_PUBLISH_JOB_NAME,
  POST_PUBLISH_QUEUE,
  type PostPublishJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class PostPublishQueueService {
  private readonly logContext = 'PostPublishQueueService';

  constructor(
    @InjectQueue(POST_PUBLISH_QUEUE)
    @Optional()
    private readonly queue: Queue<PostPublishJobData> | undefined,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(data: Omit<PostPublishJobData, 'enqueuedAt'>): Promise<string> {
    const payload: PostPublishJobData = {
      ...data,
      enqueuedAt: new Date().toISOString(),
    };
    const jobId = data.postId;
    if (!this.queue) {
      this.logger.warn(`${this.logContext} queue unavailable`, {
        jobId,
        postId: data.postId,
      });
      return jobId;
    }

    const existingJob = await this.queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        this.logger.warn(`${this.logContext} post already queued`, {
          jobId,
          postId: data.postId,
          state,
        });
        return jobId;
      }
      await existingJob.remove();
    }

    const job = await this.queue.add(POST_PUBLISH_JOB_NAME, payload, {
      attempts: 1,
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${this.logContext} queued post publish`, {
      jobId: job.id,
      organizationId: data.organizationId,
      postId: data.postId,
      source: data.source,
    });

    return job.id ?? jobId;
  }
}
