import {
  JOB_PRIORITY,
  JOB_TYPES,
  type JobConfig,
  type JobType,
  QUEUE_NAMES,
} from '@files/queues/queue.constants';
import type { FileJobData } from '@files/shared/interfaces/job.interface';
import { BaseQueueService } from '@files/shared/services/base-queue/base-queue.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

const FILE_JOB_CONFIGS: Partial<Record<JobType, JobConfig>> = {
  [JOB_TYPES.DOWNLOAD_FILE]: {
    attempts: 5,
    defaultPriority: JOB_PRIORITY.HIGH,
    delay: 1000,
  },
  [JOB_TYPES.PREPARE_ALL_FILES]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.HIGH,
    delay: 2000,
  },
  [JOB_TYPES.CLEANUP_TEMP_FILES]: {
    attempts: 2,
    defaultPriority: JOB_PRIORITY.LOW,
    delay: 1000,
  },
  [JOB_TYPES.UPLOAD_TO_S3]: {
    attempts: 5,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.ADD_WATERMARK]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
  [JOB_TYPES.CREATE_CLIPS]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 3000,
  },
  [JOB_TYPES.ADD_CAPTIONS_OVERLAY]: {
    attempts: 3,
    defaultPriority: JOB_PRIORITY.NORMAL,
    delay: 2000,
  },
};

@Injectable()
export class FileQueueService extends BaseQueueService<FileJobData> {
  protected readonly jobConfigs = FILE_JOB_CONFIGS;

  constructor(
    @InjectQueue(QUEUE_NAMES.FILE_PROCESSING)
    queue: Queue<FileJobData>,
  ) {
    super(queue, FileQueueService.name);
  }

  async addDownloadJob(data: FileJobData): Promise<Job<FileJobData>> {
    return this.addJob(
      JOB_TYPES.DOWNLOAD_FILE,
      data,
      'download',
      data.params?.url || data.url || 'unknown URL',
    );
  }

  async addPrepareFilesJob(data: FileJobData): Promise<Job<FileJobData>> {
    return this.addJob(JOB_TYPES.PREPARE_ALL_FILES, data, 'prepare files');
  }

  async addCleanupJob(data: FileJobData): Promise<Job<FileJobData>> {
    const delayMs = data.delay || 300_000; // Default 5 minutes delay
    return this.addJobWithDelay(
      JOB_TYPES.CLEANUP_TEMP_FILES,
      data,
      delayMs,
      'cleanup',
    );
  }

  async addUploadToS3Job(data: FileJobData): Promise<Job<FileJobData>> {
    return this.addJob(
      JOB_TYPES.UPLOAD_TO_S3,
      data,
      'S3 upload',
      data.filePath,
    );
  }

  async addWatermarkJob(data: FileJobData): Promise<Job<FileJobData>> {
    return this.addJob(JOB_TYPES.ADD_WATERMARK, data, 'watermark');
  }

  async addClipsJob(data: FileJobData): Promise<Job<FileJobData>> {
    return this.addJob(JOB_TYPES.CREATE_CLIPS, data, 'clips creation');
  }

  async addCaptionsOverlayJob(data: FileJobData): Promise<Job<FileJobData>> {
    return this.addJob(
      JOB_TYPES.ADD_CAPTIONS_OVERLAY,
      data,
      'captions overlay',
    );
  }
}
