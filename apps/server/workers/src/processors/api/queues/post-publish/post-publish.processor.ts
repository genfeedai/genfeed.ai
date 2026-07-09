import {
  POST_PUBLISH_QUEUE,
  type PostPublishJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import type { Job } from 'bullmq';

@Injectable()
@Processor(POST_PUBLISH_QUEUE, { concurrency: 5 })
export class PostPublishProcessor extends WorkerHost {
  private readonly logContext = 'PostPublishProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly cronPostsService: CronPostsService,
  ) {
    super();
  }

  async process(job: Job<PostPublishJobData>): Promise<void> {
    this.logger.log(`${this.logContext} processing`, {
      jobId: job.id,
      organizationId: job.data.organizationId,
      postId: job.data.postId,
      source: job.data.source,
    });

    await job.updateProgress(10);
    await this.cronPostsService.processQueuedPost(job.data);
    await job.updateProgress(100);
  }
}
