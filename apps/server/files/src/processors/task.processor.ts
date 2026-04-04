import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import type { TaskJobData } from '@files/queues/task-queue.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type { JobResult } from '@files/shared/interfaces/job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

@Processor(QUEUE_NAMES.TASK_PROCESSING)
export class TaskProcessor extends WorkerHost {
  constructor(
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(S3Service) private readonly s3Service: S3Service,
    @Inject(WebSocketService)
    private readonly websocketService: WebSocketService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<TaskJobData>): Promise<JobResult> {
    this.logger.log(`Processing task job ${job.id}: ${job.name}`);

    switch (job.name) {
      case 'transform-media':
        return await this.handleTransform(job);
      case 'upscale-media':
        return await this.handleUpscale(job);
      case 'caption-media':
        return await this.handleCaption(job);
      case 'resize-media':
        return await this.handleResize(job);
      case 'clip-media':
        return await this.handleClip(job);
      default:
        throw new Error(`Unknown task job type: ${job.name}`);
    }
  }

  private async updateProgress(
    job: Job<TaskJobData>,
    percent: number,
    message?: string,
  ) {
    await job.updateProgress({ message, percent });
    if (job.data.metadata?.websocketUrl) {
      this.websocketService.emitProgress(job.data.metadata.websocketUrl, {
        percent,
      });
    }
  }

  async handleTransform(job: Job<TaskJobData>): Promise<JobResult> {
    const { taskId, assetId, config, metadata } = job.data;
    this.logger.log(`Processing transform job ${job.id} for asset ${assetId}`);

    try {
      await this.updateProgress(job, 0, 'Starting media transformation...');

      const { orientation, aspectRatio } = config;
      const tempDir = this.ffmpegService.getTempPath('transform', assetId);
      const inputPath = path.join(tempDir, 'input.mp4');
      const outputPath = path.join(tempDir, 'output.mp4');

      // Download from S3
      if (config.s3Key) {
        await this.s3Service.downloadFile(config.s3Key, inputPath);
      }

      await this.updateProgress(job, 25, 'Downloaded source media');

      // Transform based on orientation/aspect ratio
      const [widthRatio, heightRatio] = (aspectRatio || '16:9')
        .split(':')
        .map(Number);
      let targetWidth = 1920;
      let targetHeight = 1080;

      if (orientation === 'portrait') {
        targetWidth = heightRatio * 120;
        targetHeight = widthRatio * 120;
      } else if (orientation === 'square') {
        targetWidth = targetHeight = 1080;
      }

      await this.ffmpegService.resizeVideo(
        inputPath,
        outputPath,
        targetWidth,
        targetHeight,
        (progress) => {
          const percent = 25 + (progress.percent || 0) * 0.5;
          void this.updateProgress(job, percent, 'Transforming media...');
        },
      );

      await this.updateProgress(job, 75, 'Uploading transformed media...');

      // Upload result to S3
      const s3Key = this.s3Service.generateS3Key('transformed', assetId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');

      // Cleanup
      void this.ffmpegService.cleanupTempFiles(assetId, 'transform');

      await this.updateProgress(job, 100, 'Transform complete');

      const result = {
        assetId,
        outputPath,
        s3Key,
        success: true,
        taskId,
        url: this.s3Service.getPublicUrl(s3Key),
      };

      if (metadata?.websocketUrl) {
        this.websocketService.emitSuccess(metadata.websocketUrl, result);
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`Transform job failed: ${getErrorMessage(error)}`);
      if (metadata?.websocketUrl) {
        this.websocketService.emitError(
          metadata.websocketUrl,
          getErrorMessage(error),
        );
      }
      throw error;
    }
  }

  async handleUpscale(job: Job<TaskJobData>): Promise<JobResult> {
    const { taskId, assetId, config, metadata } = job.data;
    this.logger.log(`Processing upscale job ${job.id} for asset ${assetId}`);

    try {
      await this.updateProgress(job, 0, 'Starting media upscaling...');

      const { resolution } = config;
      const tempDir = this.ffmpegService.getTempPath('upscale', assetId);
      const inputPath = path.join(tempDir, 'input.mp4');
      const outputPath = path.join(tempDir, 'output.mp4');

      // Download from S3
      if (config.s3Key) {
        await this.s3Service.downloadFile(config.s3Key, inputPath);
      }

      await this.updateProgress(job, 25, 'Downloaded source media');

      // Map resolution to dimensions
      const resolutionMap: Record<string, [number, number]> = {
        '4k': [3840, 2160],
        '720p': [1280, 720],
        '1080p': [1920, 1080],
      };

      const [width, height] = (resolution && resolutionMap[resolution]) || [
        1920, 1080,
      ];

      await this.ffmpegService.resizeVideo(
        inputPath,
        outputPath,
        width,
        height,
        (progress) => {
          const percent = 25 + (progress.percent || 0) * 0.5;
          void this.updateProgress(job, percent, 'Upscaling media...');
        },
      );

      await this.updateProgress(job, 75, 'Uploading upscaled media...');

      // Upload result to S3
      const s3Key = this.s3Service.generateS3Key('upscaled', assetId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');

      // Cleanup
      void this.ffmpegService.cleanupTempFiles(assetId, 'upscale');

      await this.updateProgress(job, 100, 'Upscale complete');

      const result = {
        assetId,
        outputPath,
        s3Key,
        success: true,
        taskId,
        url: this.s3Service.getPublicUrl(s3Key),
      };

      if (metadata?.websocketUrl) {
        this.websocketService.emitSuccess(metadata.websocketUrl, result);
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`Upscale job failed: ${getErrorMessage(error)}`);
      if (metadata?.websocketUrl) {
        this.websocketService.emitError(
          metadata.websocketUrl,
          getErrorMessage(error),
        );
      }
      throw error;
    }
  }

  async handleCaption(job: Job<TaskJobData>): Promise<JobResult> {
    const { taskId, assetId, config, metadata } = job.data;
    this.logger.log(`Processing caption job ${job.id} for asset ${assetId}`);

    try {
      await this.updateProgress(job, 0, 'Starting caption generation...');

      const captionContent = config.captionContent?.trim();
      if (!captionContent) {
        throw new Error(
          'Caption content is required for caption-media processing',
        );
      }

      const tempDir = this.ffmpegService.getTempPath('caption', assetId);
      const inputPath = path.join(tempDir, 'input.mp4');
      const outputPath = path.join(tempDir, 'output.mp4');
      const captionsPath = path.join(tempDir, 'captions.srt');

      // Download from S3
      if (config.s3Key) {
        await this.s3Service.downloadFile(config.s3Key, inputPath);
      }

      await this.updateProgress(job, 25, 'Downloaded source media');

      await this.updateProgress(job, 50, 'Generating captions...');

      await writeFile(captionsPath, captionContent, 'utf8');

      await this.ffmpegService.addCaptions(
        inputPath,
        outputPath,
        captionsPath,
        (progress) => {
          const percent = 50 + (progress.percent || 0) * 0.25;
          void this.updateProgress(job, percent, 'Processing captions...');
        },
      );

      await this.updateProgress(job, 75, 'Uploading captioned media...');

      // Upload result to S3
      const s3Key = this.s3Service.generateS3Key('captioned', assetId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');

      // Cleanup
      void this.ffmpegService.cleanupTempFiles(assetId, 'caption');

      await this.updateProgress(job, 100, 'Caption complete');

      const result = {
        assetId,
        outputPath,
        s3Key,
        success: true,
        taskId,
        url: this.s3Service.getPublicUrl(s3Key),
      };

      if (metadata?.websocketUrl) {
        this.websocketService.emitSuccess(metadata.websocketUrl, result);
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`Caption job failed: ${getErrorMessage(error)}`);
      if (metadata?.websocketUrl) {
        this.websocketService.emitError(
          metadata.websocketUrl,
          getErrorMessage(error),
        );
      }
      throw error;
    }
  }

  async handleResize(job: Job<TaskJobData>): Promise<JobResult> {
    const { taskId, assetId, config, metadata } = job.data;
    this.logger.log(`Processing resize job ${job.id} for asset ${assetId}`);

    try {
      await this.updateProgress(job, 0, 'Starting media resize...');

      const { width, height } = config;
      const tempDir = this.ffmpegService.getTempPath('resize', assetId);
      const inputPath = path.join(tempDir, 'input.mp4');
      const outputPath = path.join(tempDir, 'output.mp4');

      // Download from S3
      if (config.s3Key) {
        await this.s3Service.downloadFile(config.s3Key, inputPath);
      }

      await this.updateProgress(job, 25, 'Downloaded source media');

      const targetWidth = width || 1920;
      const targetHeight = height || 1080;

      await this.ffmpegService.resizeVideo(
        inputPath,
        outputPath,
        targetWidth,
        targetHeight,
        (progress) => {
          const percent = 25 + (progress.percent || 0) * 0.5;
          void this.updateProgress(job, percent, 'Resizing media...');
        },
      );

      await this.updateProgress(job, 75, 'Uploading resized media...');

      // Upload result to S3
      const s3Key = this.s3Service.generateS3Key('resized', assetId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');

      // Cleanup
      void this.ffmpegService.cleanupTempFiles(assetId, 'resize');

      await this.updateProgress(job, 100, 'Resize complete');

      const result = {
        assetId,
        outputPath,
        s3Key,
        success: true,
        taskId,
        url: this.s3Service.getPublicUrl(s3Key),
      };

      if (metadata?.websocketUrl) {
        this.websocketService.emitSuccess(metadata.websocketUrl, result);
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`Resize job failed: ${getErrorMessage(error)}`);
      if (metadata?.websocketUrl) {
        this.websocketService.emitError(
          metadata.websocketUrl,
          getErrorMessage(error),
        );
      }
      throw error;
    }
  }

  async handleClip(job: Job<TaskJobData>): Promise<JobResult> {
    const { taskId, assetId, config, metadata } = job.data;
    this.logger.log(`Processing clip job ${job.id} for asset ${assetId}`);

    try {
      await this.updateProgress(job, 0, 'Starting clip creation...');

      const { duration, count } = config;
      const tempDir = this.ffmpegService.getTempPath('clip', assetId);
      const inputPath = path.join(tempDir, 'input.mp4');

      // Download from S3
      if (config.s3Key) {
        await this.s3Service.downloadFile(config.s3Key, inputPath);
      }

      await this.updateProgress(job, 25, 'Downloaded source media');

      // Get video metadata
      const metadata_video =
        await this.ffmpegService.getVideoMetadata(inputPath);
      const parsedDuration = Number.parseFloat(
        metadata_video.format?.duration ?? '0',
      );
      const totalDuration = parsedDuration > 0 ? parsedDuration : 60;
      const clipDuration = duration ?? 10;
      const clipCount = count ?? 3;

      const clips: Array<{
        duration: number;
        index: number;
        s3Key: string;
        startTime: number;
        url: string;
      }> = [];

      for (let i = 0; i < clipCount; i++) {
        const startTime = (totalDuration / (clipCount + 1)) * (i + 1);
        const effectiveDuration = Math.min(
          clipDuration,
          totalDuration - startTime,
        );
        const outputPath = path.join(tempDir, `clip-${i}.mp4`);

        await this.ffmpegService.trimVideo(
          inputPath,
          outputPath,
          startTime,
          effectiveDuration,
          (progress) => {
            const percent =
              25 +
              (i / clipCount) * 50 +
              ((progress.percent || 0) * 0.5) / clipCount;
            void this.updateProgress(
              job,
              percent,
              `Creating clip ${i + 1} of ${clipCount}...`,
            );
          },
        );

        // Upload clip to S3
        const s3Key = this.s3Service.generateS3Key(
          `clips/${assetId}`,
          `clip-${i}`,
        );
        await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');

        clips.push({
          duration: clipDuration,
          index: i,
          s3Key,
          startTime,
          url: this.s3Service.getPublicUrl(s3Key),
        });
      }

      // Cleanup
      void this.ffmpegService.cleanupTempFiles(assetId, 'clip');

      await this.updateProgress(job, 100, 'Clip creation complete');

      const result = {
        assetId,
        clips,
        success: true,
        taskId,
      };

      if (metadata?.websocketUrl) {
        this.websocketService.emitSuccess(metadata.websocketUrl, result);
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`Clip job failed: ${getErrorMessage(error)}`);
      if (metadata?.websocketUrl) {
        this.websocketService.emitError(
          metadata.websocketUrl,
          getErrorMessage(error),
        );
      }
      throw error;
    }
  }
}
