import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import { FileQueueService } from '@files/queues/file-queue.service';
import { ImageQueueService } from '@files/queues/image-queue.service';
import { JOB_PRIORITY, JOB_TYPES } from '@files/queues/queue.constants';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { HookRemixJobData } from '@files/services/hook-remix/hook-remix.interfaces';
import { HookRemixService } from '@files/services/hook-remix/hook-remix.service';
import { ImagesSplitService } from '@files/services/images/images-split.service';
import { S3Service } from '@files/services/s3/s3.service';
import { VideoThumbnailService } from '@files/services/thumbnails/video-thumbnail.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';

@Controller('files')
export class FilesController {
  constructor(
    private readonly configService: ConfigService,
    @Inject(FileQueueService)
    private readonly fileQueueService: FileQueueService,
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(HookRemixService)
    private readonly hookRemixService: HookRemixService,
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ImageQueueService)
    private readonly imageQueueService: ImageQueueService,
    @Inject(ImagesSplitService)
    private readonly imagesSplitService: ImagesSplitService,
    private readonly logger: LoggerService,
    @Inject(S3Service) private readonly s3Service: S3Service,
    @Inject(TempFileCleanupCron)
    private readonly tempFileCleanupCron: TempFileCleanupCron,
    @Inject(UploadService) private readonly uploadService: UploadService,
    @Inject(VideoQueueService)
    private readonly videoQueueService: VideoQueueService,
    @Inject(VideoThumbnailService)
    private readonly videoThumbnailService: VideoThumbnailService,
    @Inject(YoutubeQueueService)
    private readonly youtubeQueueService: YoutubeQueueService,
  ) {}

  @Post('process/video')
  async processVideo(@Body() body: unknown) {
    try {
      const jobData = {
        clerkUserId: body.clerkUserId,
        createdAt: new Date(),
        id: body.id || `video-${Date.now()}`,
        ingredientId: body.ingredientId,
        metadata: {
          s3Bucket: body.s3Bucket,
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL'),
        },
        organizationId: body.organizationId,
        params: body.params,
        priority: body.priority || JOB_PRIORITY.NORMAL,
        room: body.room,
        type: body.type,
        userId: body.userId,
      };

      let job;
      switch (body.type) {
        case JOB_TYPES.RESIZE_VIDEO:
          job = await this.videoQueueService.addResizeJob(jobData);
          break;
        case JOB_TYPES.MERGE_VIDEOS:
          job = await this.videoQueueService.addMergeJob(jobData);
          break;
        case JOB_TYPES.ADD_CAPTIONS:
          job = await this.videoQueueService.addCaptionsJob(jobData);
          break;
        case JOB_TYPES.VIDEO_TO_GIF:
          job = await this.videoQueueService.addGifConversionJob(jobData);
          break;
        case JOB_TYPES.REVERSE_VIDEO:
          job = await this.videoQueueService.addReverseJob(jobData);
          break;

        case JOB_TYPES.MIRROR_VIDEO:
          job = await this.videoQueueService.addMirrorJob(jobData);
          break;

        case JOB_TYPES.ADD_TEXT_OVERLAY:
          job = await this.videoQueueService.addTextOverlayJob(jobData);
          break;

        case JOB_TYPES.CONVERT_TO_PORTRAIT:
          job = await this.videoQueueService.addPortraitConversionJob(jobData);
          break;

        case JOB_TYPES.VIDEO_TO_AUDIO:
          job = await this.videoQueueService.addVideoToAudioJob(jobData);
          break;

        case JOB_TYPES.TRIM_VIDEO:
          job = await this.videoQueueService.addTrimJob(jobData);
          break;

        case JOB_TYPES.EXTRACT_FRAMES:
          job = await this.videoQueueService.addExtractFramesJob(jobData);
          break;

        case JOB_TYPES.GET_VIDEO_METADATA:
          job = await this.videoQueueService.addGetVideoMetadataJob(jobData);
          break;

        case JOB_TYPES.HOOK_REMIX:
          job = await this.videoQueueService.addHookRemixJob(jobData);
          break;

        default:
          throw new HttpException(
            `Unknown video processing type: ${body.type}`,
            HttpStatus.BAD_REQUEST,
          );
      }

      return {
        ingredientId: body.ingredientId,
        jobId: job.id,
        status: await job.getState(),
        type: body.type,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process video:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to process video',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('process/image')
  async processImage(@Body() body: unknown) {
    try {
      const jobData = {
        clerkUserId: body.clerkUserId,
        createdAt: new Date(),
        id: body.id || `image-${Date.now()}`,
        ingredientId: body.ingredientId,
        metadata: {
          s3Bucket: body.s3Bucket,
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL'),
        },
        organizationId: body.organizationId,
        params: body.params,
        priority: body.priority || JOB_PRIORITY.NORMAL,
        room: body.room,
        type: body.type,
        userId: body.userId,
      };

      let job;
      switch (body.type) {
        case 'image-to-video':
          job = await this.imageQueueService.addImageToVideoJob(jobData);
          break;
        case 'ken-burns-effect':
          job = await this.imageQueueService.addKenBurnsJob(jobData);
          break;
        case 'split-screen':
          job = await this.imageQueueService.addSplitScreenJob(jobData);
          break;
        case 'portrait-blur':
          job = await this.imageQueueService.addPortraitBlurJob(jobData);
          break;
        case 'resize-image':
          job = await this.imageQueueService.addResizeImageJob(jobData);
          break;
        default:
          throw new HttpException(
            `Unknown image processing type: ${body.type}`,
            HttpStatus.BAD_REQUEST,
          );
      }

      return {
        ingredientId: body.ingredientId,
        jobId: job.id,
        status: await job.getState(),
        type: body.type,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process image:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to process image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('process/file')
  async processFile(@Body() body: unknown) {
    try {
      const jobData = {
        clerkUserId: body.clerkUserId,
        createdAt: new Date(),
        delay: body.delay,
        filePath: body.filePath,
        id: body.id || `file-${Date.now()}`,
        ingredientId: body.ingredientId,
        metadata: {
          s3Bucket: body.s3Bucket,
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL'),
        },
        organizationId: body.organizationId,
        params: body.params,
        priority: body.priority || JOB_PRIORITY.NORMAL,
        room: body.room,
        type: body.type,
        url: body.url,
        userId: body.userId,
      };

      let job;
      switch (body.type) {
        case 'download-file':
          job = await this.fileQueueService.addDownloadJob(jobData);
          break;
        case 'prepare-all-files':
          job = await this.fileQueueService.addPrepareFilesJob(jobData);
          break;
        case 'cleanup-temp-files':
          job = await this.fileQueueService.addCleanupJob(jobData);
          break;
        case 'upload-to-s3':
          job = await this.fileQueueService.addUploadToS3Job(jobData);
          break;
        case 'add-watermark':
          job = await this.fileQueueService.addWatermarkJob(jobData);
          break;
        case 'create-clips':
          job = await this.fileQueueService.addClipsJob(jobData);
          break;
        case 'add-captions-overlay':
          job = await this.fileQueueService.addCaptionsOverlayJob(jobData);
          break;
        default:
          throw new HttpException(
            `Unknown file processing type: ${body.type}`,
            HttpStatus.BAD_REQUEST,
          );
      }

      return {
        ingredientId: body.ingredientId,
        jobId: job.id,
        status: await job.getState(),
        type: body.type,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process file:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to process file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('process/youtube')
  async processYoutube(@Body() body: unknown) {
    try {
      const status = body.status || 'unlisted'; // Default to unlisted if no status provided
      const jobData = {
        brandId: body.brandId,
        clerkUserId: body.clerkUserId,
        createdAt: new Date(),
        credential: body.credential,
        description: body.description,
        id: body.id || `youtube-${Date.now()}`,
        ingredientId: body.ingredientId,
        isUnlisted: status === 'unlisted',
        metadata: {
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL'),
        },
        organizationId: body.organizationId,
        postId: body.postId,
        priority: body.priority || JOB_PRIORITY.HIGH,
        room: body.room,
        scheduledDate: body.scheduledDate,
        status,
        tags: body.tags,
        title: body.title,
        type: JOB_TYPES.UPLOAD_YOUTUBE,
        userId: body.userId,
      };

      const job = await this.youtubeQueueService.addUploadJob(jobData);

      return {
        jobId: job.id,
        postId: body.postId,
        status: await job.getState(),
        type: 'upload-youtube',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process YouTube upload:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to process YouTube upload',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('process/hook-remix')
  async processHookRemix(@Body() body: HookRemixJobData) {
    try {
      if (!body.youtubeUrl || !body.ctaVideoUrl || !body.hookDurationSeconds) {
        throw new HttpException(
          'youtubeUrl, ctaVideoUrl, and hookDurationSeconds are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const jobId = body.jobId || `hook-remix-${Date.now()}`;
      this.logger.log(
        `[HookRemix] Processing request: ${body.youtubeUrl}, hook=${body.hookDurationSeconds}s`,
      );

      const result = await this.hookRemixService.processHookRemix({
        ...body,
        jobId,
      });

      return {
        jobId,
        ...result,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process hook remix:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        (error as Error)?.message || 'Failed to process hook remix',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('job/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    try {
      // Try to find the job in all queues (in parallel for better performance)
      const [videoJob, imageJob, fileJob, youtubeJob] = await Promise.all([
        this.videoQueueService.getJob(jobId),
        this.imageQueueService.getJob(jobId),
        this.fileQueueService.getJob(jobId),
        this.youtubeQueueService.getJob(jobId),
      ]);

      const job = videoJob || imageJob || fileJob || youtubeJob;

      if (!job) {
        throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        data: job.data,
        failedReason: job.failedReason,
        jobId: job.id,
        progress,
        result: job.returnvalue,
        state,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to get job status for ${jobId}:`, error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to get job status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  async getQueueStats() {
    try {
      const [videoCounts, imageCounts, fileCounts] = await Promise.all([
        this.videoQueueService.getJobCounts(),
        this.imageQueueService.getJobCounts(),
        this.fileQueueService.getJobCounts(),
      ]);

      return {
        file: fileCounts,
        image: imageCounts,
        timestamp: new Date(),
        video: videoCounts,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get queue stats:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to get queue statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Overlay audio onto video with various mix modes
   * Supports: replace (replace video audio), mix (blend both), background (audio as background music)
   */
  @Post('processing/audio-overlay')
  async audioOverlay(
    @Body()
    body: {
      videoUrl: string;
      audioUrl: string;
      mixMode?: 'replace' | 'mix' | 'background';
      audioVolume?: number;
      videoVolume?: number;
      fadeIn?: number;
      fadeOut?: number;
      outputKey?: string;
    },
  ) {
    let videoTempPath: string | undefined;
    let audioTempPath: string | undefined;
    let outputTempPath: string | undefined;

    try {
      const {
        videoUrl,
        audioUrl,
        mixMode = 'replace',
        audioVolume = 100,
        videoVolume = 100,
        fadeIn = 0,
        fadeOut = 0,
        outputKey,
      } = body;

      if (!videoUrl || !audioUrl) {
        throw new HttpException(
          'videoUrl and audioUrl are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Processing audio overlay: mode=${mixMode}, audioVol=${audioVolume}%, videoVol=${videoVolume}%`,
      );

      // Create temp directory
      const tmpDir = this.ffmpegService.getTempPath('audio-overlay');
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);

      // Download video
      this.logger.log(`Downloading video from: ${videoUrl}`);
      const videoResponse = await firstValueFrom(
        this.httpService.get(videoUrl, {
          maxContentLength: 500 * 1024 * 1024, // 500MB limit
          responseType: 'arraybuffer',
          timeout: 120000, // 2 minute timeout
        }),
      );
      videoTempPath = path.resolve(
        tmpDir,
        `video_${timestamp}_${randomSuffix}.mp4`,
      );
      fs.writeFileSync(videoTempPath, Buffer.from(videoResponse.data));
      this.logger.log(`Video downloaded to: ${videoTempPath}`);

      // Download audio
      this.logger.log(`Downloading audio from: ${audioUrl}`);
      const audioResponse = await firstValueFrom(
        this.httpService.get(audioUrl, {
          maxContentLength: 100 * 1024 * 1024, // 100MB limit
          responseType: 'arraybuffer',
          timeout: 60000, // 1 minute timeout
        }),
      );

      // Determine audio extension from Content-Type or URL
      const audioContentType =
        audioResponse.headers['content-type'] || 'audio/mpeg';
      let audioExt = '.mp3';
      if (audioContentType.includes('wav')) {
        audioExt = '.wav';
      } else if (audioContentType.includes('ogg')) {
        audioExt = '.ogg';
      } else if (audioContentType.includes('m4a')) {
        audioExt = '.m4a';
      } else if (audioContentType.includes('aac')) {
        audioExt = '.aac';
      }

      audioTempPath = path.resolve(
        tmpDir,
        `audio_${timestamp}_${randomSuffix}${audioExt}`,
      );
      fs.writeFileSync(audioTempPath, Buffer.from(audioResponse.data));
      this.logger.log(`Audio downloaded to: ${audioTempPath}`);

      // Output path
      outputTempPath = path.resolve(
        tmpDir,
        `output_${timestamp}_${randomSuffix}.mp4`,
      );

      // Process audio overlay
      this.logger.log(`Processing audio overlay with FFmpeg...`);
      await this.ffmpegService.overlayAudio(
        videoTempPath,
        audioTempPath,
        outputTempPath,
        {
          audioVolume,
          fadeIn,
          fadeOut,
          mixMode,
          videoVolume,
        },
      );
      this.logger.log(`Audio overlay complete: ${outputTempPath}`);

      // Upload to S3
      const finalKey =
        outputKey || `audio-overlay/${timestamp}_${randomSuffix}.mp4`;
      this.logger.log(`Uploading result to S3: ${finalKey}`);

      const uploadResult = await this.uploadService.uploadToS3(
        finalKey,
        'videos',
        {
          path: outputTempPath,
          type: 'file',
        },
      );

      this.logger.log(`Upload complete: ${uploadResult.publicUrl}`);

      return {
        audioUrl: body.audioUrl,
        mixMode,
        outputUrl: uploadResult.publicUrl,
        s3Key: finalKey,
        success: true,
        videoUrl: body.videoUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process audio overlay:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        (error as Error)?.message || 'Failed to process audio overlay',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      // Cleanup temp files
      const filesToClean = [
        videoTempPath,
        audioTempPath,
        outputTempPath,
      ].filter((f): f is string => !!f && fs.existsSync(f));

      for (const file of filesToClean) {
        try {
          fs.unlinkSync(file);
          this.logger.log(`Cleaned up temp file: ${file}`);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to cleanup temp file: ${file}`,
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
          );
        }
      }
    }
  }

  @Post('processing/generate-thumbnail')
  async generateThumbnail(
    @Body()
    body: {
      videoUrl: string;
      ingredientId: string;
      timeInSeconds?: number;
      width?: number;
    },
  ) {
    try {
      const { videoUrl, ingredientId, timeInSeconds, width } = body;

      if (!videoUrl || !ingredientId) {
        throw new HttpException(
          'videoUrl and ingredientId are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Generating thumbnail for video: ${videoUrl}, ingredient: ${ingredientId}`,
      );

      const thumbnailUrl = await this.videoThumbnailService.generateThumbnail(
        videoUrl,
        ingredientId,
        timeInSeconds,
        width,
      );

      return {
        ingredientId,
        thumbnailUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate thumbnail:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to generate thumbnail',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Split a contact sheet image into individual frames
   */
  @Post('processing/split-image')
  async splitImage(
    @Body()
    body: {
      imageUrl: string;
      gridRows: number;
      gridCols: number;
      borderInset?: number;
    },
  ) {
    try {
      const { imageUrl, gridRows, gridCols, borderInset } = body;

      if (!imageUrl || !gridRows || !gridCols) {
        throw new HttpException(
          'imageUrl, gridRows, and gridCols are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (gridRows < 2 || gridRows > 4 || gridCols < 2 || gridCols > 4) {
        throw new HttpException(
          'gridRows and gridCols must be between 2 and 4',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Splitting contact sheet: ${gridRows}x${gridCols}, inset: ${borderInset ?? 10}px`,
      );

      // Download the image
      const response = await firstValueFrom(
        this.httpService.get(imageUrl, {
          maxContentLength: 50 * 1024 * 1024, // 50MB limit
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
        }),
      );

      const imageBuffer = Buffer.from(response.data);

      // Split the image
      const splitResults = await this.imagesSplitService.splitImage(
        imageBuffer,
        gridRows,
        gridCols,
        borderInset ?? 10,
      );

      const frames = splitResults.map((result) =>
        result.buffer.toString('base64'),
      );

      return {
        count: frames.length,
        frames,
        gridCols,
        gridRows,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to split image:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to split image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('metadata')
  async getFileMetadata(@Body() body: { filePath?: string; url?: string }) {
    let filePath: string | undefined;
    let tempFilePath: string | undefined;
    let shouldCleanup = true; // Flag to control cleanup

    try {
      const { filePath: bodyFilePath, url } = body;

      if (!bodyFilePath && !url) {
        throw new HttpException(
          'Either filePath or url is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // If URL is provided, download the file first
      if (url) {
        this.logger.log(`Downloading file from URL for metadata: ${url}`);
        try {
          const response = await firstValueFrom(
            this.httpService.get(url, {
              maxBodyLength: 100 * 1024 * 1024,
              maxContentLength: 100 * 1024 * 1024, // 100MB limit
              maxRedirects: 5, // Limit redirects
              responseType: 'arraybuffer',
              timeout: 60000, // 60 second timeout
            }),
          );

          const tmpDir = path.resolve('public', 'tmp', 'metadata');
          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
          }

          // Determine file extension from URL or Content-Type
          const contentType =
            response.headers['content-type'] || 'application/octet-stream';
          const extension = this.getFileExtensionFromContentType(contentType);

          const tempFileName = `metadata_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`;
          tempFilePath = path.resolve(tmpDir, tempFileName);
          fs.writeFileSync(tempFilePath, Buffer.from(response.data));

          filePath = tempFilePath;

          // Don't cleanup immediately - we'll return the file path for caching
          shouldCleanup = false;

          this.logger.log(
            `File downloaded to temporary location: ${tempFilePath}`,
          );
        } catch (error: unknown) {
          this.logger.error(
            `Failed to download file from URL: ${url}`,
            error as Error,
          );

          const parsedError = error as {
            response?: { status?: number };
            code?: string;
            message?: string;
          };

          if (parsedError?.response?.status === 404) {
            throw new HttpException(
              `File not found at URL: ${url}`,
              HttpStatus.NOT_FOUND,
            );
          } else if (parsedError?.response?.status === 403) {
            throw new HttpException(
              `Access denied to URL: ${url}`,
              HttpStatus.FORBIDDEN,
            );
          } else if (parsedError?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
            throw new HttpException(
              `File size exceeds 100MB limit`,
              HttpStatus.PAYLOAD_TOO_LARGE,
            );
          } else if (
            parsedError?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            parsedError?.code === 'CERT_HAS_EXPIRED'
          ) {
            throw new HttpException(
              `SSL certificate error for URL: ${url}`,
              HttpStatus.BAD_REQUEST,
            );
          }

          throw new HttpException(
            `Failed to download file from URL: ${parsedError?.message || 'Unknown error'}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        filePath = bodyFilePath;
      }

      if (!filePath) {
        throw new HttpException('filePath is required', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Getting metadata for file: ${filePath}`);

      const metadata = await this.ffmpegService.getVideoMetadata(filePath);

      return {
        ...metadata,
        ...(tempFilePath && {
          cachedFileName: path.basename(tempFilePath),
          cachedFilePath: tempFilePath,
        }),
      };
    } catch (error: unknown) {
      const parsedError = error as { name?: string; message?: string };
      if (
        parsedError?.name === 'ValidationException' ||
        (error instanceof Error && error.message.includes('does not exist'))
      ) {
        this.logger.error(`File not accessible: ${filePath}`, parsedError);
        throw new HttpException(
          `File not accessible: ${parsedError?.message || 'File does not exist or is not readable.'}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (parsedError instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to get file metadata:', error);
      throw new HttpException(
        parsedError?.message || 'Failed to get file metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      // Only clean up temporary file if shouldCleanup flag is true
      // (i.e., if there was an error or it wasn't a URL download)
      if (shouldCleanup && tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          this.logger.log(`Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupError: unknown) {
          this.logger.warn(
            `Failed to cleanup temporary file: ${tempFilePath}`,
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
          );
        }
      }
    }
  }

  /**
   * Helper method to determine file extension from Content-Type header
   */
  private getFileExtensionFromContentType(contentType: string): string {
    // Video formats
    if (contentType.startsWith('video/')) {
      if (contentType.includes('quicktime')) {
        return '.mov';
      }
      if (contentType.includes('avi') || contentType.includes('msvideo')) {
        return '.avi';
      }
      if (contentType.includes('webm')) {
        return '.webm';
      }
      if (contentType.includes('x-matroska')) {
        return '.mkv';
      }
      return '.mp4'; // Default for video
    }

    // Image formats
    if (contentType.startsWith('image/')) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        return '.jpg';
      }
      if (contentType.includes('png')) {
        return '.png';
      }
      if (contentType.includes('webp')) {
        return '.webp';
      }
      if (contentType.includes('gif')) {
        return '.gif';
      }
      if (contentType.includes('bmp')) {
        return '.bmp';
      }
      if (contentType.includes('tiff')) {
        return '.tiff';
      }
      return '.jpg'; // Default for image
    }

    // Audio formats
    if (contentType.startsWith('audio/')) {
      if (contentType.includes('mpeg')) {
        return '.mp3';
      }
      if (contentType.includes('wav')) {
        return '.wav';
      }
      if (contentType.includes('ogg')) {
        return '.ogg';
      }
      return '.mp3'; // Default for audio
    }

    return '.bin'; // Default fallback
  }

  /**
   * Serve cached temporary files
   */
  @Get('temp/:filename')
  async getTempFile(@Param('filename') filename: string) {
    try {
      const tmpDir = path.resolve('public', 'tmp', 'metadata');
      const filePath = path.resolve(tmpDir, filename);

      // Security check: ensure file is within tmp directory
      if (!filePath.startsWith(tmpDir)) {
        throw new HttpException('Invalid file path', HttpStatus.BAD_REQUEST);
      }

      if (!fs.existsSync(filePath)) {
        throw new HttpException('File not found', HttpStatus.NOT_FOUND);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const extension = path.extname(filename).toLowerCase();

      let contentType = 'application/octet-stream';
      if (['.mp4', '.mov', '.avi', '.webm', '.mkv'].includes(extension)) {
        contentType = 'video/mp4';
      } else if (
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)
      ) {
        contentType = `image/${extension.substring(1)}`;
      }

      return {
        buffer: fileBuffer.toString('base64'),
        contentType,
        filename,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to serve temp file: ${filename}`, error);
      throw new HttpException(
        'Failed to retrieve temporary file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Manual cleanup endpoint for temporary files
   * Note: Automatic cleanup runs daily at 2 AM via @Cron decorator in TempFileCleanupCron
   */
  @Post('cleanup-temp-files')
  async cleanupTempFiles() {
    try {
      const result = await this.tempFileCleanupCron.manualCleanup();
      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to cleanup temp files:', error);
      throw new HttpException(
        'Failed to cleanup temporary files',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Upload file to S3 with metadata extraction and image processing
   */
  @Post('upload')
  async uploadFile(
    @Body()
    body: {
      key: string;
      type: string;
      source:
        | { type: 'file'; path: string }
        | { type: 'url'; url: string }
        | { type: 'base64'; data: string; contentType: string }
        | { type: 'buffer'; data: string; contentType: string }; // base64 encoded buffer
    },
  ) {
    try {
      const { key, type, source } = body;

      this.logger.log('Upload request received', {
        key,
        sourceType: source?.type,
        type,
        url: source?.type === 'url' ? source.url : undefined,
      });

      if (!key || !type || !source) {
        throw new HttpException(
          'key, type, and source are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate URL if source type is 'url'
      if (source.type === 'url') {
        if (!source.url || typeof source.url !== 'string') {
          this.logger.error('Invalid URL source', {
            source,
            url: source.url,
            urlType: typeof source.url,
          });
          throw new HttpException(
            'url is required and must be a string when source type is "url"',
            HttpStatus.BAD_REQUEST,
          );
        }
        // Basic URL validation
        try {
          new URL(source.url);
        } catch (urlError) {
          this.logger.error('Invalid URL format', {
            error: urlError,
            url: source.url,
          });
          throw new HttpException(
            `Invalid URL: ${source.url}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Convert base64 buffer to Buffer if needed
      let processedSource:
        | { type: 'file'; path: string }
        | { type: 'url'; url: string }
        | { type: 'base64'; data: string; contentType: string }
        | { type: 'buffer'; data: Buffer; contentType: string };

      if (source.type === 'buffer') {
        processedSource = {
          contentType: source.contentType,
          data: Buffer.from(source.data, 'base64'),
          type: 'buffer',
        };
      } else {
        processedSource = source;
      }

      const result = await this.uploadService.uploadToS3(
        key,
        type,
        processedSource,
      );

      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to upload file:', error);

      // Preserve HttpException status codes
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        (error as Error)?.message || 'Failed to upload file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Download file from S3
   */
  @Get('download/:type/*key')
  async downloadFile(
    @Param('type') type: string,
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const keyString = typeof key === 'string' ? key : String(key);
      const s3Key = this.s3Service.generateS3Key(type, keyString);
      const stream = await this.s3Service.getFileStream(s3Key);

      const extension = path.extname(keyString).toLowerCase();
      let contentType = 'application/octet-stream';
      if (['.mp4', '.mov', '.avi', '.webm', '.mkv'].includes(extension)) {
        contentType = 'video/mp4';
      } else if (
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)
      ) {
        contentType = `image/${extension.substring(1)}`;
      } else if (['.mp3', '.wav', '.ogg'].includes(extension)) {
        contentType = 'audio/mpeg';
      }

      res.set({
        'Content-Disposition': `attachment; filename="${keyString}"`,
        'Content-Type': contentType,
      });

      return new StreamableFile(stream);
    } catch (error: unknown) {
      this.logger.error('Failed to download file', {
        error: (error as Error)?.message || 'Unknown error',
        key: typeof key === 'string' ? key : String(key),
        statusCode:
          (error as { statusCode?: number })?.statusCode ||
          (error as { status?: number })?.status,
        type,
      });
      throw new HttpException(
        (error as Error)?.message || 'Failed to download file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Copy file within S3
   */
  @Post('copy')
  async copyFile(
    @Body()
    body: {
      sourceKey: string;
      destinationKey: string;
      sourceType?: string;
      destinationType?: string;
    },
  ) {
    const { sourceKey, destinationKey, sourceType, destinationType } = body;

    if (!sourceKey || !destinationKey) {
      throw new HttpException(
        'sourceKey and destinationKey are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Generate S3 keys: if types are provided, use generateS3Key; otherwise assume keys are already full S3 keys
    const finalSourceKey = sourceType
      ? this.s3Service.generateS3Key(sourceType, sourceKey)
      : sourceKey;

    const finalDestinationKey = destinationType
      ? this.s3Service.generateS3Key(destinationType, destinationKey)
      : destinationKey;

    try {
      await this.s3Service.copyFile(finalSourceKey, finalDestinationKey);

      return {
        destinationKey: finalDestinationKey,
        publicUrl: this.s3Service.getPublicUrl(finalDestinationKey),
        sourceKey: finalSourceKey,
        success: true,
      };
    } catch (error: unknown) {
      const parsedError = error as {
        message?: string;
        code?: string;
        status?: number;
        statusCode?: number;
        stack?: string;
      };
      const errorMessage = parsedError?.message || 'Unknown error';

      const errorDetails = {
        code: parsedError?.code,
        destinationKey: finalDestinationKey,
        message: errorMessage,
        sourceKey: finalSourceKey,
        statusCode: parsedError?.status || parsedError?.statusCode,
      };

      this.logger.error(
        `Failed to copy file: ${errorMessage}`,
        parsedError?.stack || JSON.stringify(errorDetails),
      );

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get presigned upload URL
   */
  @Post('presigned-upload')
  async getPresignedUploadUrl(
    @Body()
    body: { filename: string; contentType: string; type: string },
  ) {
    try {
      const key = this.s3Service.generateS3Key(body.type, body.filename);

      const { uploadUrl, publicUrl } =
        await this.s3Service.getPresignedUploadUrl(
          key,
          body.contentType,
          3600, // 1 hour expiry
        );

      return {
        expiresIn: 3600,
        key,
        publicUrl,
        uploadUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate presigned upload URL:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to generate presigned upload URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get presigned download URL
   */
  @Get('presigned-download/:type/*key')
  async getPresignedDownloadUrl(
    @Param('type') type: string,
    @Param('key') key: string,
  ) {
    try {
      // Generate S3 key: ingredients/${type}/${key}
      const s3Key = this.s3Service.generateS3Key(type, key);
      const downloadUrl = await this.s3Service.getPresignedDownloadUrl(
        s3Key,
        3600,
      );

      return {
        downloadUrl,
        expiresIn: 3600,
        key: s3Key,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate presigned download URL:', error);
      throw new HttpException(
        (error as Error)?.message ||
          'Failed to generate presigned download URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
