import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type {
  FileJobData,
  JobProgress,
  JobResult,
} from '@files/shared/interfaces/job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';

@Processor(QUEUE_NAMES.FILE_PROCESSING)
export class FileProcessor extends WorkerHost {
  constructor(
    private readonly configService: ConfigService,
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(HttpService) private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    @Inject(S3Service) private readonly s3Service: S3Service,
    @Inject(WebSocketService)
    private readonly websocketService: WebSocketService,
  ) {
    super();
  }

  async process(job: Job<FileJobData>): Promise<unknown> {
    this.logger.log(`Processing file job ${job.id}: ${job.name}`);

    switch (job.name) {
      case 'download-file':
        return await this.handleDownloadFile(job);
      case 'prepare-all-files':
        return await this.handlePrepareFiles(job);
      case 'cleanup-temp-files':
        return await this.handleCleanupFiles(job);
      case 'upload-to-s3':
        return await this.handleUploadToS3(job);
      default:
        throw new Error(`Unknown file job type: ${job.name}`);
    }
  }

  async handleDownloadFile(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(`Processing download job ${job.id} for ${params.url}`);

    try {
      await this.updateProgress(job, 0, 'Starting download...');

      const tempDir = this.ffmpegService.getTempPath(
        params.type || 'downloads',
        ingredientId,
      );
      const extension = this.getExtension(params.type);
      const filename = `file-${params.index || Date.now()}.${extension}`;
      const filePath = path.join(tempDir, filename);

      // Download file
      const response = await firstValueFrom(
        this.httpService.get(params?.url || '', {
          onDownloadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1),
            );
            void this.updateProgress(job, percentCompleted, 'Downloading...');
          },
          responseType: 'arraybuffer',
        }),
      );

      const buffer = Buffer.from(response.data);

      if (params.type === 'images' || params.type === 'trainings') {
        await sharp(buffer)
          .rotate()
          .resize({ width: 1080, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(filePath);
      } else {
        fs.writeFileSync(filePath, buffer);
      }

      await this.updateProgress(job, 100, 'Download complete');

      return {
        outputPath: filePath,
        size: buffer.length,
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Download failed for job ${job.id}:`, error);
      throw error;
    }
  }

  async handlePrepareFiles(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(
      `Processing prepare files job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      await this.updateProgress(job, 0, 'Starting file preparation...');

      const frames = params.frames || [];
      const results = {
        captions: [] as {
          duration: number;
          voiceText: string;
          overlayText: string;
        }[],
        images: [] as string[],
        imageToVideos: [] as string[],
        voices: [] as string[],
      };

      // Extract data from frames
      const images = frames
        .map((frame: unknown) => frame.image)
        .filter(Boolean);
      const voices = frames
        .map((frame: unknown) => frame.voice)
        .filter(Boolean);
      const imageToVideos = frames
        .map((frame: unknown) => frame.imageToVideo)
        .filter(Boolean);

      results.captions = frames.map((frame: unknown) => ({
        duration: frame.duration,
        overlayText: frame.overlayText,
        voiceText: frame.voiceText,
      }));

      let progress = 10;

      // Download image-to-videos or images
      if (imageToVideos.length > 0) {
        this.logger.log('Downloading image-to-videos');
        for (let i = 0; i < imageToVideos.length; i++) {
          const filePath = await this.downloadIngredientFile(
            ingredientId,
            'image-to-videos',
            imageToVideos[i],
            i,
          );
          results.imageToVideos.push(filePath);
          progress += 30 / imageToVideos.length;
          await this.updateProgress(
            job,
            Math.round(progress),
            `Downloading video ${i + 1}/${imageToVideos.length}`,
          );
        }
      } else {
        this.logger.log('Downloading images');
        for (let i = 0; i < images.length; i++) {
          const filePath = await this.downloadIngredientFile(
            ingredientId,
            'images',
            images[i],
            i,
          );
          results.images.push(filePath);
          progress += 30 / images.length;
          await this.updateProgress(
            job,
            Math.round(progress),
            `Downloading image ${i + 1}/${images.length}`,
          );
        }
      }

      // Download voices
      this.logger.log('Downloading voices');
      for (let i = 0; i < voices.length; i++) {
        const filePath = await this.downloadIngredientFile(
          ingredientId,
          'voices',
          voices[i],
          i,
        );
        results.voices.push(filePath);
        progress += 30 / voices.length;
        await this.updateProgress(
          job,
          Math.round(progress),
          `Downloading voice ${i + 1}/${voices.length}`,
        );
      }

      // Download background music
      if (params.musicId) {
        this.logger.log('Downloading background music');
        await this.downloadIngredientFile(
          ingredientId,
          'musics',
          params.musicId,
          0,
        );
        progress += 10;
        await this.updateProgress(
          job,
          Math.round(progress),
          'Downloaded background music',
        );
      }

      await this.updateProgress(job, 100, 'All files prepared');

      return {
        outputPath: this.ffmpegService.getTempPath('output', ingredientId),
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Prepare files failed for job ${job.id}:`, error);
      throw error;
    }
  }

  async handleCleanupFiles(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(
      `Processing cleanup job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      const tempDirs = params.tempDirs || [
        'clips',
        'image-to-videos',
        'images',
        'musics',
        'slides',
        'voices',
      ];

      if (params.isDeleteOutputEnabled) {
        tempDirs.push('output');
      }

      for (const dir of tempDirs) {
        await this.ffmpegService.cleanupTempFiles(ingredientId, dir);
      }

      this.logger.log(`Cleaned up temp files for ingredient ${ingredientId}`);

      return {
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Cleanup failed for job ${job.id}:`, error);
      // Don't throw on cleanup failures
      return {
        error: getErrorMessage(error) || 'Cleanup failed',
        success: false,
      };
    }
  }

  async handleUploadToS3(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(
      `Processing S3 upload job ${job.id} for ${params.filePath}`,
    );

    try {
      await this.updateProgress(job, 0, 'Starting upload to S3...');

      const filePath = params.filePath!;
      const s3Key =
        params.s3Key || this.s3Service.generateS3Key('files', ingredientId);

      const result = await this.s3Service.uploadFile(
        s3Key,
        filePath,
        params.contentType || this.getContentType(filePath),
      );

      await this.updateProgress(job, 100, 'Upload complete');

      return {
        outputPath: result.Location,
        s3Key,
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`S3 upload failed for job ${job.id}:`, error);
      throw error;
    }
  }

  async handleAddWatermark(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(
      `Processing watermark job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      await this.updateProgress(job, 0, 'Adding watermark...');

      const inputPath = params.filePath!;
      const outputPath = path.join(
        path.dirname(inputPath),
        `${path.basename(inputPath, path.extname(inputPath))}_watermark${path.extname(inputPath)}`,
      );

      const text = params.watermarkText || '@genfeedai';

      await this.ffmpegService.addTextOverlay(
        inputPath,
        outputPath,
        text,
        { position: 'bottom' },
        (progress) =>
          void this.updateProgress(
            job,
            progress.percent || 50,
            'Processing watermark...',
          ),
      );

      await this.updateProgress(job, 100, 'Watermark added');

      return {
        outputPath,
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Watermark failed for job ${job.id}:`, error);
      throw error;
    }
  }

  async handleCreateClips(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId } = job.data;
    this.logger.log(
      `Processing clips job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      await this.updateProgress(job, 0, 'Creating clips...');

      await this.updateProgress(job, 100, 'Clips created');

      return {
        outputPath: this.ffmpegService.getTempPath('clips', ingredientId),
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Create clips failed for job ${job.id}:`, error);
      throw error;
    }
  }

  async handleAddCaptionsOverlay(job: Job<FileJobData>): Promise<JobResult> {
    const { ingredientId } = job.data;
    this.logger.log(
      `Processing captions overlay job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      await this.updateProgress(job, 0, 'Adding captions overlay...');

      await this.updateProgress(job, 100, 'Captions overlay added');

      return {
        outputPath: this.ffmpegService.getTempPath('output', ingredientId),
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Captions overlay failed for job ${job.id}:`, error);
      throw error;
    }
  }

  private async updateProgress(
    job: Job,
    percent: number,
    status: string,
  ): Promise<void> {
    const progress: JobProgress = {
      percent,
      time: new Date().toISOString(),
    };

    await job.updateProgress(progress);

    // Send WebSocket update
    this.websocketService.sendProgress(job.data.ingredientId, {
      jobId: job.id?.toString() || 'unknown',
      progress: percent,
      status,
      type: job.name,
    });
  }

  private async downloadIngredientFile(
    scriptId: string,
    type: string,
    ingredientId: string,
    index: number,
  ): Promise<string> {
    const ingredientsEndpoint = this.configService.ingredientsEndpoint;
    const url = `${ingredientsEndpoint}/ingredients/${type}/${ingredientId}`;
    const tempDir = this.ffmpegService.getTempPath(type, scriptId);

    const extension = this.getExtension(type);
    const filename = `frame-${index}.${extension}`;
    const filePath = path.join(tempDir, filename);

    const response = await firstValueFrom(
      this.httpService.get(url, { responseType: 'arraybuffer' }),
    );

    const buffer = Buffer.from(response.data);

    if (type === 'images' || type === 'trainings') {
      await sharp(buffer)
        .rotate()
        .resize({ width: 1080, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(filePath);
    } else {
      fs.writeFileSync(filePath, buffer);
    }

    return filePath;
  }

  private getExtension(type?: string): string {
    switch (type) {
      case 'images':
      case 'trainings':
        return 'jpeg';
      case 'videos':
      case 'image-to-videos':
      case 'clips':
        return 'mp4';
      case 'voices':
      case 'musics':
        return 'mp3';
      default:
        return 'bin';
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.mp4':
        return 'video/mp4';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.mp3':
        return 'audio/mpeg';
      default:
        return 'application/octet-stream';
    }
  }
}
