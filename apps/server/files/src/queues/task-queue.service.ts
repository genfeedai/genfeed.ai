import {
  JOB_PRIORITY,
  JOB_TYPES,
  type JobConfig,
  type JobPriority,
  type JobType,
  QUEUE_NAMES,
} from '@files/queues/queue.constants';
import type { TaskProcessingConfig } from '@files/shared/interfaces/job.interface';
import { BaseQueueService } from '@files/shared/services/base-queue/base-queue.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

export interface TaskJobData {
  taskId: string;
  userId: string;
  organizationId: string;
  assetId: string;
  config: TaskProcessingConfig;
  metadata?: {
    websocketUrl?: string;
    workflowId?: string;
    stepId?: string;
  };
  priority?: JobPriority;
}

const TASK_JOB_CONFIGS: Partial<Record<JobType, JobConfig>> = {
  [JOB_TYPES.TRANSFORM_MEDIA]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.UPSCALE_MEDIA]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 3000,
  },
  [JOB_TYPES.CAPTION_MEDIA]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.RESIZE_MEDIA]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.CLIP_MEDIA]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2500,
  },
};

@Injectable()
export class TaskQueueService extends BaseQueueService<TaskJobData> {
  protected readonly jobConfigs = TASK_JOB_CONFIGS;

  constructor(
    @InjectQueue(QUEUE_NAMES.TASK_PROCESSING)
    queue: Queue<TaskJobData>,
  ) {
    super(queue, TaskQueueService.name);
  }

  async addTransformJob(data: TaskJobData): Promise<Job<TaskJobData>> {
    return this.addJob(
      JOB_TYPES.TRANSFORM_MEDIA,
      data,
      'transform',
      `asset ${data.assetId}`,
    );
  }

  async addUpscaleJob(data: TaskJobData): Promise<Job<TaskJobData>> {
    return this.addJob(
      JOB_TYPES.UPSCALE_MEDIA,
      data,
      'upscale',
      `asset ${data.assetId}`,
    );
  }

  async addCaptionJob(data: TaskJobData): Promise<Job<TaskJobData>> {
    return this.addJob(
      JOB_TYPES.CAPTION_MEDIA,
      data,
      'caption',
      `asset ${data.assetId}`,
    );
  }

  async addResizeJob(data: TaskJobData): Promise<Job<TaskJobData>> {
    return this.addJob(
      JOB_TYPES.RESIZE_MEDIA,
      data,
      'resize',
      `asset ${data.assetId}`,
    );
  }

  async addClipJob(data: TaskJobData): Promise<Job<TaskJobData>> {
    return this.addJob(
      JOB_TYPES.CLIP_MEDIA,
      data,
      'clip',
      `asset ${data.assetId}`,
    );
  }
}
