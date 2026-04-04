import {
  JOB_PRIORITY,
  JOB_TYPES,
  type JobConfig,
  type JobType,
  QUEUE_NAMES,
} from '@files/queues/queue.constants';
import type { YoutubeJobData } from '@files/shared/interfaces/job.interface';
import { BaseQueueService } from '@files/shared/services/base-queue/base-queue.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

const YOUTUBE_JOB_CONFIGS: Partial<Record<JobType, JobConfig>> = {
  [JOB_TYPES.UPLOAD_YOUTUBE_UNLISTED]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.HIGH,
    delay: 2000,
  },
  [JOB_TYPES.UPLOAD_YOUTUBE]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.HIGH,
    delay: 2000,
  },
};

@Injectable()
export class YoutubeQueueService extends BaseQueueService<YoutubeJobData> {
  protected readonly jobConfigs = YOUTUBE_JOB_CONFIGS;

  constructor(
    @InjectQueue(QUEUE_NAMES.YOUTUBE_PROCESSING)
    queue: Queue<YoutubeJobData>,
  ) {
    super(queue, YoutubeQueueService.name);
  }

  async addUploadUnlistedJob(
    data: YoutubeJobData,
  ): Promise<Job<YoutubeJobData>> {
    return this.addJob(
      JOB_TYPES.UPLOAD_YOUTUBE_UNLISTED,
      data,
      'YouTube unlisted upload',
      `post ${data.postId}`,
    );
  }

  async addUploadJob(data: YoutubeJobData): Promise<Job<YoutubeJobData>> {
    return this.addJob(
      JOB_TYPES.UPLOAD_YOUTUBE,
      data,
      'YouTube upload',
      `post ${data.postId}`,
    );
  }
}
