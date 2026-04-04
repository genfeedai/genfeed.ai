import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type {
  ImageJobData,
  JobResult,
} from '@files/shared/interfaces/job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

@Processor(QUEUE_NAMES.IMAGE_PROCESSING)
export class ImageProcessor extends WorkerHost {
  constructor(
    @Inject(WebSocketService) private webSocketService: WebSocketService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<ImageJobData>): Promise<JobResult> {
    this.logger.log(`Processing image job ${job.id}: ${job.name}`);

    switch (job.name) {
      case 'image-to-video':
        return await this.handleImageToVideo(job);
      case 'ken-burns-effect':
        return await this.handleKenBurnsEffect(job);
      case 'split-screen':
        return await this.handleSplitScreen(job);
      case 'portrait-blur':
        return await this.handlePortraitBlur(job);
      case 'resize-image':
        return await this.handleResizeImage(job);
      default:
        throw new Error(`Unknown image job type: ${job.name}`);
    }
  }

  handleImageToVideo(job: Job<ImageJobData>): JobResult {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing image-to-video job for ${ingredientId}`);

    try {
      // Not implemented — fail honestly
      this.logger.warn('Image to video conversion not yet implemented');
      return {
        error: 'Image to video conversion not implemented',
        success: false,
      };
    } catch (error: unknown) {
      this.logger.error(`Image-to-video job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
      );
      throw error;
    }
  }

  handleKenBurnsEffect(job: Job<ImageJobData>): JobResult {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing Ken Burns effect for ${ingredientId}`);

    try {
      // Not implemented — fail honestly
      this.logger.warn('Ken Burns effect not yet implemented');
      return {
        error: 'Ken Burns effect not implemented',
        success: false,
      };
    } catch (error: unknown) {
      this.logger.error(`Ken Burns job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
      );
      throw error;
    }
  }

  handleSplitScreen(job: Job<ImageJobData>): JobResult {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing split screen for ${ingredientId}`);

    try {
      // Not implemented — fail honestly
      this.logger.warn('Split screen not yet implemented');
      return {
        error: 'Split screen not implemented',
        success: false,
      };
    } catch (error: unknown) {
      this.logger.error(`Split screen job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
      );
      throw error;
    }
  }

  handlePortraitBlur(job: Job<ImageJobData>): JobResult {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing portrait blur for ${ingredientId}`);

    try {
      // Not implemented — fail honestly
      this.logger.warn('Portrait blur not yet implemented');
      return {
        error: 'Portrait blur not implemented',
        success: false,
      };
    } catch (error: unknown) {
      this.logger.error(`Portrait blur job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
      );
      throw error;
    }
  }

  handleResizeImage(job: Job<ImageJobData>): JobResult {
    const { ingredientId, params, metadata } = job.data;
    this.logger.log(`Processing resize image job for ${ingredientId}`);

    try {
      // Not implemented — fail honestly
      this.logger.warn('Image resizing not yet implemented');
      return {
        error: 'Image resizing not implemented',
        success: false,
      };
    } catch (error: unknown) {
      this.logger.error(`Resize image job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
      );
      throw error;
    }
  }
}
