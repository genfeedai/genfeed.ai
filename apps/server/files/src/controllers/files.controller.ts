import { ConfigService } from '@files/config/config.service';
import { FileQueueService } from '@files/queues/file-queue.service';
import { ImageQueueService } from '@files/queues/image-queue.service';
import type { JobPriority, JobType } from '@files/queues/queue.constants';
import { JOB_PRIORITY, JOB_TYPES } from '@files/queues/queue.constants';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import type { HookRemixJobData } from '@files/services/hook-remix/hook-remix.interfaces';
import { HookRemixService } from '@files/services/hook-remix/hook-remix.service';
import type {
  FileJobData,
  FileProcessingParams,
  ImageJobData,
  ImageProcessingParams,
  VideoJobData,
  VideoProcessingParams,
  YoutubeCredential,
} from '@files/shared/interfaces/job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import type { Job } from 'bullmq';

interface ProcessVideoRequestBody {
  authProviderUserId?: string;
  id?: string;
  ingredientId: string;
  organizationId: string;
  params: VideoProcessingParams;
  priority?: JobPriority;
  room?: string;
  s3Bucket?: string;
  type: JobType;
  userId: string;
  websocketUrl?: string;
}

interface ProcessImageRequestBody {
  authProviderUserId?: string;
  id?: string;
  ingredientId: string;
  organizationId: string;
  params: ImageProcessingParams;
  priority?: JobPriority;
  room?: string;
  s3Bucket?: string;
  type: JobType;
  userId: string;
  websocketUrl?: string;
}

interface ProcessFileRequestBody {
  authProviderUserId?: string;
  delay?: number;
  filePath?: string;
  id?: string;
  ingredientId: string;
  organizationId: string;
  params: FileProcessingParams;
  priority?: JobPriority;
  room?: string;
  s3Bucket?: string;
  type: JobType;
  url?: string;
  userId: string;
  websocketUrl?: string;
}

interface ProcessYoutubeRequestBody {
  authProviderUserId?: string;
  brandId?: string;
  credential: YoutubeCredential;
  description: string;
  id?: string;
  ingredientId: string;
  organizationId: string;
  postId: string;
  priority?: JobPriority;
  room?: string;
  scheduledDate?: string;
  status?: 'public' | 'private' | 'scheduled' | 'unlisted';
  tags?: string[];
  title: string;
  userId: string;
  websocketUrl?: string;
}

@Controller('files')
export class FilesController {
  constructor(
    private readonly configService: ConfigService,
    @Inject(FileQueueService)
    private readonly fileQueueService: FileQueueService,
    @Inject(HookRemixService)
    private readonly hookRemixService: HookRemixService,
    @Inject(ImageQueueService)
    private readonly imageQueueService: ImageQueueService,
    private readonly logger: LoggerService,
    @Inject(VideoQueueService)
    private readonly videoQueueService: VideoQueueService,
    @Inject(YoutubeQueueService)
    private readonly youtubeQueueService: YoutubeQueueService,
  ) {}

  @Post('process/video')
  async processVideo(@Body() body: ProcessVideoRequestBody) {
    try {
      const jobData = {
        authProviderUserId: body.authProviderUserId,
        createdAt: new Date(),
        id: body.id || `video-${Date.now()}`,
        ingredientId: body.ingredientId,
        metadata: {
          s3Bucket: body.s3Bucket,
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL') || '',
        },
        organizationId: body.organizationId,
        params: body.params,
        priority: body.priority || JOB_PRIORITY.NORMAL,
        room: body.room,
        type: body.type,
        userId: body.userId,
      };

      let job: Job<VideoJobData>;
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

        case JOB_TYPES.CLIP_TRIM:
          job = await this.videoQueueService.addClipTrimJob(jobData);
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
        case JOB_TYPES.RENDER_EDITOR_COMPOSITION:
          job = await this.videoQueueService.addEditorCompositionJob(jobData);
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
  async processImage(@Body() body: ProcessImageRequestBody) {
    try {
      const jobData = {
        authProviderUserId: body.authProviderUserId,
        createdAt: new Date(),
        id: body.id || `image-${Date.now()}`,
        ingredientId: body.ingredientId,
        metadata: {
          s3Bucket: body.s3Bucket,
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL') || '',
        },
        organizationId: body.organizationId,
        params: body.params,
        priority: body.priority || JOB_PRIORITY.NORMAL,
        room: body.room,
        type: body.type,
        userId: body.userId,
      };

      let job: Job<ImageJobData>;
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
  async processFile(@Body() body: ProcessFileRequestBody) {
    try {
      const jobData = {
        authProviderUserId: body.authProviderUserId,
        createdAt: new Date(),
        delay: body.delay,
        filePath: body.filePath,
        id: body.id || `file-${Date.now()}`,
        ingredientId: body.ingredientId,
        metadata: {
          s3Bucket: body.s3Bucket,
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL') || '',
        },
        organizationId: body.organizationId,
        params: body.params,
        priority: body.priority || JOB_PRIORITY.NORMAL,
        room: body.room,
        type: body.type,
        url: body.url,
        userId: body.userId,
      };

      let job: Job<FileJobData>;
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
  async processYoutube(@Body() body: ProcessYoutubeRequestBody) {
    try {
      const status = body.status || 'unlisted'; // Default to unlisted if no status provided
      const jobData = {
        brandId: body.brandId,
        authProviderUserId: body.authProviderUserId,
        createdAt: new Date(),
        credential: body.credential,
        description: body.description,
        id: body.id || `youtube-${Date.now()}`,
        ingredientId: body.ingredientId,
        isUnlisted: status === 'unlisted',
        metadata: {
          websocketUrl:
            body.websocketUrl || this.configService.get('WEBSOCKET_URL') || '',
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
}
