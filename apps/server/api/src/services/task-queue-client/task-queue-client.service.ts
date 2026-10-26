import {
  FILES_REQUEST_TIMEOUT_MS,
  FilesRetryPolicy,
  sendFilesRequest,
} from '@api/services/files-microservice/client/files-request-retry.util';
import { ConfigService } from '@libs/config/config.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';

export interface TaskJobRequest {
  taskId: string;
  userId: string;
  organizationId: string;
  assetId: string;
  config: Record<string, unknown>;
  metadata?: {
    websocketUrl?: string;
    workflowId?: string;
    stepId?: string;
  };
  priority?: number;
}

type TaskQueueJobType = 'caption' | 'clip' | 'resize' | 'transform' | 'upscale';

/**
 * TaskQueueClientService
 *
 * Client service for the API app to interact with the task processing queue
 * in the files microservice. This allows tasks and workflows to queue jobs
 * for media transformation, upscaling, captioning, resizing, and clipping.
 */
@Injectable()
export class TaskQueueClientService {
  private readonly logger = new Logger(TaskQueueClientService.name);
  private readonly filesServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.filesServiceUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://localhost:3012';
  }

  async queueTransformJob(data: TaskJobRequest) {
    return this.queueJob('transform', data);
  }

  async queueUpscaleJob(data: TaskJobRequest) {
    return this.queueJob('upscale', data);
  }

  async queueCaptionJob(data: TaskJobRequest) {
    return this.queueJob('caption', data);
  }

  async queueResizeJob(data: TaskJobRequest) {
    return this.queueJob('resize', data);
  }

  async queueClipJob(data: TaskJobRequest) {
    return this.queueJob('clip', data);
  }

  private async queueJob(type: TaskQueueJobType, data: TaskJobRequest) {
    try {
      const response = await sendFilesRequest(
        () =>
          this.httpService.post(
            `${this.filesServiceUrl}/tasks/queue/${type}`,
            data,
            { timeout: FILES_REQUEST_TIMEOUT_MS.STANDARD },
          ),
        { logger: this.logger, operation: `queueJob:${type}` },
      );
      this.logger.log(`Queued ${type} job for asset ${data.assetId}`);
      return response.data;
    } catch (error: unknown) {
      this.logger.error(`Failed to queue ${type} job`, error);
      throw error;
    }
  }

  async getJobStatus(jobId: string) {
    try {
      const response = await sendFilesRequest(
        () =>
          this.httpService.get(
            `${this.filesServiceUrl}/tasks/queue/status/${jobId}`,
            { timeout: FILES_REQUEST_TIMEOUT_MS.QUICK },
          ),
        {
          logger: this.logger,
          operation: 'getJobStatus',
          retryPolicy: FilesRetryPolicy.IDEMPOTENT,
        },
      );
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to get job status', error);
      throw error;
    }
  }
}
