import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { FilesPortraitBlurService } from '@files/services/files/blur/files-portrait-blur.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesImageToVideoService } from '@files/services/files/image-to-video/files-image-to-video.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import { FilesSplitScreenService } from '@files/services/files/split/files-split-screen.service';
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
    @Inject(FilesImageToVideoService)
    private readonly filesImageToVideoService: FilesImageToVideoService,
    @Inject(FilesKenBurnsEffectService)
    private readonly filesKenBurnsEffectService: FilesKenBurnsEffectService,
    @Inject(FilesSplitScreenService)
    private readonly filesSplitScreenService: FilesSplitScreenService,
    @Inject(FilesPortraitBlurService)
    private readonly filesPortraitBlurService: FilesPortraitBlurService,
    @Inject(FilesService) private readonly filesService: FilesService,
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

  async handleImageToVideo(job: Job<ImageJobData>): Promise<JobResult> {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing image-to-video job for ${ingredientId}`);

    try {
      const outputPath =
        await this.filesImageToVideoService.createVideoFromImages(
          job.data.params.images ?? [],
          {
            dimensions: this.getDimensions(job.data.params),
            fontFamily: job.data.params.fontFamily,
            isWatermarkEnabled: job.data.params.isWatermarkEnabled,
            slideText: job.data.params.slideText,
            websocketURL: metadata.websocketUrl,
          },
          ingredientId,
        );

      return await this.completeImageJob(job, outputPath);
    } catch (error: unknown) {
      this.logger.error(`Image-to-video job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
        job.data.authProviderUserId,
        job.data.room,
      );
      throw error;
    }
  }

  async handleKenBurnsEffect(job: Job<ImageJobData>): Promise<JobResult> {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing Ken Burns effect for ${ingredientId}`);

    try {
      const outputPath =
        await this.filesKenBurnsEffectService.applyKenBurnsEffect(
          job.data.params.inputPath ?? '',
          job.data.params.duration ?? 3,
          ingredientId,
          {
            dimensions: this.getDimensions(job.data.params),
            fontFamily: job.data.params.fontFamily,
            isClipSelected: job.data.params.isClipSelected,
            isWatermarkEnabled: job.data.params.isWatermarkEnabled,
            slideText: job.data.params.slideText,
            websocketURL: metadata.websocketUrl,
          },
        );

      return await this.completeImageJob(job, outputPath);
    } catch (error: unknown) {
      this.logger.error(`Ken Burns job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
        job.data.authProviderUserId,
        job.data.room,
      );
      throw error;
    }
  }

  async handleSplitScreen(job: Job<ImageJobData>): Promise<JobResult> {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing split screen for ${ingredientId}`);

    try {
      const [topClip, bottomClip] = job.data.params.videos ?? [];
      const outputPath =
        await this.filesSplitScreenService.createSplitScreenVideo(
          job.data.params.videos ?? [],
          ingredientId,
          {
            bottomClip,
            dimensions: this.getDimensions(job.data.params),
            layout: job.data.params.layout,
            topClip,
          },
        );

      return await this.completeImageJob(job, outputPath);
    } catch (error: unknown) {
      this.logger.error(`Split screen job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
        job.data.authProviderUserId,
        job.data.room,
      );
      throw error;
    }
  }

  async handlePortraitBlur(job: Job<ImageJobData>): Promise<JobResult> {
    const { ingredientId, metadata } = job.data;
    this.logger.log(`Processing portrait blur for ${ingredientId}`);

    try {
      const outputPath = await this.filesPortraitBlurService.applyPortraitBlur(
        job.data.params.inputPath ?? '',
        ingredientId,
        {
          dimensions: this.getDimensions(job.data.params),
          inputType: job.data.params.inputType,
          videoFile: job.data.params.videoFile,
        },
      );

      return await this.completeImageJob(job, outputPath);
    } catch (error: unknown) {
      this.logger.error(`Portrait blur job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
        job.data.authProviderUserId,
        job.data.room,
      );
      throw error;
    }
  }

  async handleResizeImage(job: Job<ImageJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata } = job.data;
    this.logger.log(`Processing resize image job for ${ingredientId}`);

    try {
      if (!params.inputPath) {
        return await this.failImageJob(job, 'inputPath is required');
      }

      if (!this.isPositiveNumber(params.width)) {
        return await this.failImageJob(job, 'width must be a positive number');
      }

      if (!this.isPositiveNumber(params.height)) {
        return await this.failImageJob(job, 'height must be a positive number');
      }

      const input = await readFile(params.inputPath);
      const resized = await this.filesService.resizeImage(input, {
        height: params.height,
        width: params.width,
      });
      const outputPath =
        params.outputPath ??
        path.join(
          this.filesService.getPath('images', ingredientId),
          `${job.id?.toString() ?? ingredientId}-resized.jpg`,
        );

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, resized);

      return await this.completeImageJob(job, outputPath, {
        height: params.height,
        size: resized.length,
        width: params.width,
      });
    } catch (error: unknown) {
      this.logger.error(`Resize image job failed: ${getErrorMessage(error)}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        getErrorMessage(error),
        job.data.authProviderUserId,
        job.data.room,
      );
      throw error;
    }
  }

  private getDimensions(params: ImageJobData['params']): {
    height: number;
    width: number;
  } {
    if (
      params.dimensions &&
      this.isPositiveNumber(params.dimensions.width) &&
      this.isPositiveNumber(params.dimensions.height)
    ) {
      return {
        height: params.dimensions.height,
        width: params.dimensions.width,
      };
    }

    if (
      this.isPositiveNumber(params.width) &&
      this.isPositiveNumber(params.height)
    ) {
      return {
        height: params.height,
        width: params.width,
      };
    }

    return { height: 1920, width: 1080 };
  }

  private isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private async completeImageJob(
    job: Job<ImageJobData>,
    outputPath: string,
    result?: Pick<JobResult, 'height' | 'size' | 'width'>,
  ): Promise<JobResult> {
    const { metadata, authProviderUserId, room } = job.data;
    const jobResult: JobResult = {
      outputPath,
      success: true,
      ...result,
    };

    await this.webSocketService.emitSuccess(
      metadata.websocketUrl,
      jobResult,
      authProviderUserId,
      room,
    );

    return jobResult;
  }

  private async failImageJob(
    job: Job<ImageJobData>,
    message: string,
  ): Promise<JobResult> {
    const { metadata, authProviderUserId, room } = job.data;

    this.logger.warn(message);
    await this.webSocketService.emitError(
      metadata.websocketUrl,
      message,
      authProviderUserId,
      room,
    );

    return {
      error: message,
      success: false,
    };
  }
}
