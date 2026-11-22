import type { YoutubeJobData } from '@files/shared/interfaces/job.interface';
import type { JobConfig } from '@files/shared/interfaces/job-config.interface';
import { BaseQueueService } from '@files/shared/services/base-queue/base-queue.service';
import {
  FILE_JOB_PRIORITY as JOB_PRIORITY,
  FILE_JOB_TYPES as JOB_TYPES,
  type FileJobType as JobType,
  FILE_QUEUE_NAMES as QUEUE_NAMES,
} from '@genfeedai/contracts/queue';
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

/** States in which a job may still upload; it must not be replaced. */
const IN_FLIGHT_STATES = new Set<string>([
  'active',
  'waiting',
  'delayed',
  'prioritized',
]);

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
    return this.addDeterministicJob(
      JOB_TYPES.UPLOAD_YOUTUBE_UNLISTED,
      data,
      'YouTube unlisted upload',
    );
  }

  async addUploadJob(data: YoutubeJobData): Promise<Job<YoutubeJobData>> {
    return this.addDeterministicJob(
      JOB_TYPES.UPLOAD_YOUTUBE,
      data,
      'YouTube upload',
    );
  }

  /**
   * One upload job per post: `youtube-upload-<postId>` (hyphens only, BullMQ
   * rejects ':' in ids). A job still in flight is returned instead of added
   * again. A finished job retained under the id is removed first, so a retry
   * of a failed post still enqueues.
   */
  private async addDeterministicJob(
    jobType: JobType,
    data: YoutubeJobData,
    logLabel: string,
  ): Promise<Job<YoutubeJobData>> {
    const jobId = `youtube-upload-${data.postId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (IN_FLIGHT_STATES.has(state)) {
        this.logger.log(
          `${logLabel} job ${jobId} already ${state}; not queuing a second upload`,
        );
        return existing as Job<YoutubeJobData>;
      }
      await existing.remove();
    }

    return this.addJob(jobType, data, logLabel, `post ${data.postId}`, jobId);
  }
}
