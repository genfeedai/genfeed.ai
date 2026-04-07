import { ConfigService } from '@api/config/config.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

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
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/tasks/queue/transform`,
          data,
        ),
      );
      this.logger.log(`Queued transform job for asset ${data.assetId}`);
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to queue transform job', error);
      throw error;
    }
  }

  async queueUpscaleJob(data: TaskJobRequest) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/tasks/queue/upscale`,
          data,
        ),
      );
      this.logger.log(`Queued upscale job for asset ${data.assetId}`);
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to queue upscale job', error);
      throw error;
    }
  }

  async queueCaptionJob(data: TaskJobRequest) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/tasks/queue/caption`,
          data,
        ),
      );
      this.logger.log(`Queued caption job for asset ${data.assetId}`);
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to queue caption job', error);
      throw error;
    }
  }

  async queueResizeJob(data: TaskJobRequest) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/tasks/queue/resize`,
          data,
        ),
      );
      this.logger.log(`Queued resize job for asset ${data.assetId}`);
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to queue resize job', error);
      throw error;
    }
  }

  async queueClipJob(data: TaskJobRequest) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.filesServiceUrl}/tasks/queue/clip`, data),
      );
      this.logger.log(`Queued clip job for asset ${data.assetId}`);
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to queue clip job', error);
      throw error;
    }
  }

  async getJobStatus(jobId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.filesServiceUrl}/tasks/queue/status/${jobId}`,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.logger.error('Failed to get job status', error);
      throw error;
    }
  }
}
