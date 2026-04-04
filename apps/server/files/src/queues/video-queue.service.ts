import {
  JOB_PRIORITY,
  JOB_TYPES,
  type JobConfig,
  type JobType,
  QUEUE_NAMES,
} from '@files/queues/queue.constants';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { BaseQueueService } from '@files/shared/services/base-queue/base-queue.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

const VIDEO_JOB_CONFIGS: Partial<Record<JobType, JobConfig>> = {
  [JOB_TYPES.RESIZE_VIDEO]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.MERGE_VIDEOS]: {
    attempts: 2,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 5000,
  },
  [JOB_TYPES.ADD_CAPTIONS]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.VIDEO_TO_GIF]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.LOW,
    delay: 2000,
  },
  [JOB_TYPES.REVERSE_VIDEO]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.MIRROR_VIDEO]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.ADD_TEXT_OVERLAY]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.CONVERT_TO_PORTRAIT]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 3000,
  },
  [JOB_TYPES.VIDEO_TO_AUDIO]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.TRIM_VIDEO]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.EXTRACT_FRAMES]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.GET_VIDEO_METADATA]: {
    attempts: 2,
    defaultPriority: JOB_PRIORITY.HIGH,
    delay: 1000,
  },
  [JOB_TYPES.HOOK_REMIX]: {
    attempts: 2,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
};

@Injectable()
export class VideoQueueService extends BaseQueueService<VideoJobData> {
  protected readonly jobConfigs = VIDEO_JOB_CONFIGS;

  constructor(
    @InjectQueue(QUEUE_NAMES.VIDEO_PROCESSING)
    queue: Queue<VideoJobData>,
  ) {
    super(queue, VideoQueueService.name);
  }

  async addResizeJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.RESIZE_VIDEO, data, 'resize');
  }

  async addMergeJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(
      JOB_TYPES.MERGE_VIDEOS,
      data,
      'merge',
      `${data.params.sourceIds?.length} videos`,
    );
  }

  async addCaptionsJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.ADD_CAPTIONS, data, 'captions');
  }

  async addGifConversionJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.VIDEO_TO_GIF, data, 'GIF conversion');
  }

  async addReverseJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.REVERSE_VIDEO, data, 'reverse');
  }

  async addMirrorJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.MIRROR_VIDEO, data, 'mirror');
  }

  async addTextOverlayJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.ADD_TEXT_OVERLAY, data, 'text overlay');
  }

  async addPortraitConversionJob(
    data: VideoJobData,
  ): Promise<Job<VideoJobData>> {
    return this.addJob(
      JOB_TYPES.CONVERT_TO_PORTRAIT,
      data,
      'portrait conversion',
    );
  }

  async addVideoToAudioJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.VIDEO_TO_AUDIO, data, 'video-to-audio');
  }

  async addTrimJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.TRIM_VIDEO, data, 'trim');
  }

  async addExtractFramesJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.EXTRACT_FRAMES, data, 'extract frames');
  }

  async addGetVideoMetadataJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(
      JOB_TYPES.GET_VIDEO_METADATA,
      data,
      'get video metadata',
    );
  }

  async addHookRemixJob(data: VideoJobData): Promise<Job<VideoJobData>> {
    return this.addJob(JOB_TYPES.HOOK_REMIX, data, 'hook remix');
  }
}
