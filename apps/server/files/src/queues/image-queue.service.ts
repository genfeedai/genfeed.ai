import {
  JOB_PRIORITY,
  JOB_TYPES,
  type JobConfig,
  type JobType,
  QUEUE_NAMES,
} from '@files/queues/queue.constants';
import type { ImageJobData } from '@files/shared/interfaces/job.interface';
import { BaseQueueService } from '@files/shared/services/base-queue/base-queue.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

const IMAGE_JOB_CONFIGS: Partial<Record<JobType, JobConfig>> = {
  [JOB_TYPES.IMAGE_TO_VIDEO]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.KEN_BURNS_EFFECT]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.SPLIT_SCREEN]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.PORTRAIT_BLUR]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.RESIZE_IMAGE]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
};

@Injectable()
export class ImageQueueService extends BaseQueueService<ImageJobData> {
  protected readonly jobConfigs = IMAGE_JOB_CONFIGS;

  constructor(
    @InjectQueue(QUEUE_NAMES.IMAGE_PROCESSING)
    queue: Queue<ImageJobData>,
  ) {
    super(queue, ImageQueueService.name);
  }

  async addImageToVideoJob(data: ImageJobData): Promise<Job<ImageJobData>> {
    return this.addJob(JOB_TYPES.IMAGE_TO_VIDEO, data, 'image-to-video');
  }

  async addKenBurnsJob(data: ImageJobData): Promise<Job<ImageJobData>> {
    return this.addJob(JOB_TYPES.KEN_BURNS_EFFECT, data, 'Ken Burns');
  }

  async addSplitScreenJob(data: ImageJobData): Promise<Job<ImageJobData>> {
    return this.addJob(JOB_TYPES.SPLIT_SCREEN, data, 'split screen');
  }

  async addPortraitBlurJob(data: ImageJobData): Promise<Job<ImageJobData>> {
    return this.addJob(JOB_TYPES.PORTRAIT_BLUR, data, 'portrait blur');
  }

  async addResizeImageJob(data: ImageJobData): Promise<Job<ImageJobData>> {
    return this.addJob(JOB_TYPES.RESIZE_IMAGE, data, 'resize image');
  }
}
