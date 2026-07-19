import * as fs from 'node:fs';
import path from 'node:path';
import { JOB_TYPES, QUEUE_NAMES } from '@files/queues/queue.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { HookRemixJobData } from '@files/services/hook-remix/hook-remix.interfaces';
import { HookRemixService } from '@files/services/hook-remix/hook-remix.service';
import { RemotionRenderJobService } from '@files/services/remotion/remotion-render-job.service';
import { S3Service } from '@files/services/s3/s3.service';
import { VideoMergeJobService } from '@files/services/video-merge/video-merge-job.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import {
  JobProgress,
  JobResult,
  VideoJobData,
} from '@files/shared/interfaces/job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';

interface VideoCompletionResult {
  jobId?: string;
  jobType?: string;
  ingredientId?: string;
  outputPath?: string;
  s3Key?: string;
  url?: string;
  duration?: number;
  startTime?: number;
  endTime?: number;
}

@Processor(QUEUE_NAMES.VIDEO_PROCESSING)
export class VideoProcessor extends WorkerHost {
  constructor(
    @Inject(FFmpegService) private ffmpegService: FFmpegService,
    @Inject(HookRemixService) private hookRemixService: HookRemixService,
    private readonly videoMergeJobService: VideoMergeJobService,
    @Inject(S3Service) private s3Service: S3Service,
    @Inject(WebSocketService) private webSocketService: WebSocketService,
    private redisService: RedisService,
    private readonly logger: LoggerService,
    private readonly remotionRenderJobService: RemotionRenderJobService,
  ) {
    super();
  }

  async process(job: Job<VideoJobData>): Promise<unknown> {
    this.logger.log(`Processing video job ${job.id}: ${job.name}`);

    switch (job.name) {
      case JOB_TYPES.MERGE_VIDEOS:
        return await this.handleMerge(job);
      case JOB_TYPES.RESIZE_VIDEO:
        return await this.handleResize(job);
      case JOB_TYPES.ADD_CAPTIONS:
        return await this.handleAddCaptions(job);
      case JOB_TYPES.VIDEO_TO_GIF:
        return await this.handleVideoToGif(job);
      case JOB_TYPES.REVERSE_VIDEO:
        return await this.handleReverse(job);
      case JOB_TYPES.MIRROR_VIDEO:
        return await this.handleMirror(job);
      case JOB_TYPES.TRIM_VIDEO:
        return await this.handleTrim(job);
      case JOB_TYPES.CLIP_TRIM:
        return await this.handleClipTrim(job);
      case JOB_TYPES.ADD_TEXT_OVERLAY:
        return await this.handleTextOverlay(job);
      case JOB_TYPES.CONVERT_TO_PORTRAIT:
        return await this.handlePortraitConversion(job);
      case JOB_TYPES.VIDEO_TO_AUDIO:
        return await this.handleVideoToAudio(job);
      case JOB_TYPES.EXTRACT_FRAMES:
        return await this.handleExtractFrames(job);
      case JOB_TYPES.GET_VIDEO_METADATA:
        return await this.handleGetVideoMetadata(job);
      case JOB_TYPES.HOOK_REMIX:
        return await this.handleHookRemix(job);
      case JOB_TYPES.RENDER_EDITOR_COMPOSITION:
        return await this.remotionRenderJobService.process(job);
      default:
        throw new Error(`Unknown video job type: ${job.name}`);
    }
  }

  /**
   * Convert FFmpegProgress to JobProgress
   */
  private convertToJobProgress(ffmpegProgress: FFmpegProgress): JobProgress {
    return {
      fps: ffmpegProgress.fps,
      frames: ffmpegProgress.frames,
      percent: ffmpegProgress.percent || 50,
      size: ffmpegProgress.size,
      speed: ffmpegProgress.speed,
      time: ffmpegProgress.time,
    };
  }

  /**
   * Publish video completion event to Redis
   */
  private async publishVideoCompletion(
    ingredientId: string,
    userId: string,
    organizationId: string,
    status: 'completed' | 'failed',
    result?: VideoCompletionResult | null,
    error?: string,
  ): Promise<void> {
    try {
      await this.redisService.publish('video-processing-complete', {
        error,
        ingredientId,
        organizationId,
        result,
        status,
        timestamp: new Date().toISOString(),
        userId,
      });
      this.logger.log(`Published video completion event for ${ingredientId}`);
    } catch (publishError: unknown) {
      this.logger.error(
        `Failed to publish video completion event: ${publishError}`,
      );
    }
  }

  /**
   * Download input file from S3 or URL
   */
  private async downloadInput(
    params: { s3Key?: string; inputPath?: string },
    destinationPath: string,
  ): Promise<void> {
    if (params.s3Key) {
      await this.s3Service.downloadFile(params.s3Key, destinationPath);
    } else if (params.inputPath) {
      await this.s3Service.downloadFromUrl(params.inputPath, destinationPath);
    }
  }

  /**
   * Create progress callback for WebSocket emission
   */
  private createProgressCallback(
    websocketUrl: string,
    authProviderUserId?: string,
    room?: string,
  ): (progress: FFmpegProgress) => void {
    return (progress) => {
      this.webSocketService.emitProgress(
        websocketUrl,
        this.convertToJobProgress(progress),
        authProviderUserId,
        room,
      );
    };
  }

  /**
   * Upload result and emit success
   */
  private async uploadAndEmitSuccess(
    outputPath: string,
    ingredientId: string,
    s3Folder: string,
    contentType: string,
    websocketUrl: string,
    authProviderUserId?: string,
    room?: string,
  ): Promise<{ s3Key: string; url: string }> {
    const s3Key = this.s3Service.generateS3Key(s3Folder, ingredientId);
    await this.s3Service.uploadFile(s3Key, outputPath, contentType);
    const url = this.s3Service.getPublicUrl(s3Key);

    this.webSocketService.emitSuccess(
      websocketUrl,
      { ingredientId, s3Key, url },
      authProviderUserId,
      room,
    );

    return { s3Key, url };
  }

  async handleResize(job: Job<VideoJobData>): Promise<JobResult> {
    const {
      ingredientId,
      params,
      metadata,
      userId,
      organizationId,
      authProviderUserId,
      room,
    } = job.data;
    this.logger.log(`Processing resize job for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('resize', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.resizeVideo(
        inputPath,
        outputPath,
        params.width || 1080,
        params.height || 1920,
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key, url } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'videos',
        'video/mp4',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'resize');

      await this.publishVideoCompletion(
        ingredientId,
        userId,
        organizationId,
        'completed',
        {
          ingredientId,
          outputPath,
          s3Key,
          url,
        },
      );

      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Resize job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      await this.publishVideoCompletion(
        ingredientId,
        userId,
        organizationId,
        'failed',
        null,
        message,
      );
      throw error;
    }
  }

  async handleMerge(job: Job<VideoJobData>): Promise<JobResult> {
    return await this.videoMergeJobService.process(job);
  }

  async handleAddCaptions(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing captions job for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('captions', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');
      const captionsPath = path.join(tempPath, 'captions.srt');

      await this.downloadInput(params, inputPath);
      fs.writeFileSync(captionsPath, params.captionContent || '');

      await this.ffmpegService.addCaptions(
        inputPath,
        outputPath,
        captionsPath,
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key, url } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'videos',
        'video/mp4',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'captions');
      const result = {
        jobId: String(job.id),
        jobType: JOB_TYPES.ADD_CAPTIONS,
        outputPath,
        s3Key,
        success: true,
        url,
      };
      await this.publishVideoCompletion(
        ingredientId,
        job.data.userId,
        job.data.organizationId,
        'completed',
        result,
      );
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Captions job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      await this.publishVideoCompletion(
        ingredientId,
        job.data.userId,
        job.data.organizationId,
        'failed',
        {
          jobId: String(job.id),
          jobType: JOB_TYPES.ADD_CAPTIONS,
        },
        message,
      );
      throw error;
    }
  }

  async handleVideoToGif(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing GIF conversion for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('gif', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.gif');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.convertToGif(
        inputPath,
        outputPath,
        { fps: params.fps, width: params.width },
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'gifs',
        'image/gif',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'gif');
      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`GIF conversion failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  async handleReverse(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing reverse job for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('reverse', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.reverseVideo(
        inputPath,
        outputPath,
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'videos',
        'video/mp4',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'reverse');
      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Reverse job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  async handleMirror(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing mirror job for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('mirror', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.mirrorVideo(
        inputPath,
        outputPath,
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'videos',
        'video/mp4',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'mirror');
      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Mirror job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  async handleTrim(job: Job<VideoJobData>): Promise<JobResult> {
    const {
      ingredientId,
      params,
      metadata,
      userId,
      organizationId,
      authProviderUserId,
      room,
    } = job.data;
    this.logger.log(`Processing trim for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('trim', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      const startTime = params.startTime || 0;
      const endTime = params.endTime || params.duration || 0;
      const duration = endTime - startTime;

      if (duration < 2 || duration > 15) {
        throw new Error('Trim duration must be between 2 and 15 seconds');
      }

      await this.ffmpegService.trimVideo(
        inputPath,
        outputPath,
        startTime,
        duration,
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const s3Key = this.s3Service.generateS3Key('videos', ingredientId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');
      this.ffmpegService.cleanupTempFiles(ingredientId, 'trim');

      await this.publishVideoCompletion(
        ingredientId,
        userId,
        organizationId,
        'completed',
        {
          duration,
          endTime,
          ingredientId,
          s3Key,
          startTime,
          url: this.s3Service.getPublicUrl(s3Key),
        },
      );

      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Trim job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  /**
   * Clip-ready trim primitive: cuts an arbitrary time range from a source
   * video with no duration guard. Returns a public URL alongside the s3Key
   * so downstream clip pipelines can consume the result directly.
   */
  async handleClipTrim(job: Job<VideoJobData>): Promise<JobResult> {
    const {
      ingredientId,
      params,
      metadata,
      userId,
      organizationId,
      authProviderUserId,
      room,
    } = job.data;
    this.logger.log(`Processing clip trim for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath(
        'clip-trim',
        ingredientId,
      );
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      const startTime = params.startTime || 0;
      const endTime = params.endTime || params.duration || 0;
      const duration = endTime - startTime;

      await this.ffmpegService.trimVideo(
        inputPath,
        outputPath,
        startTime,
        duration,
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const s3Key = this.s3Service.generateS3Key('videos', ingredientId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');
      const url = this.s3Service.getPublicUrl(s3Key);
      this.ffmpegService.cleanupTempFiles(ingredientId, 'clip-trim');

      await this.publishVideoCompletion(
        ingredientId,
        userId,
        organizationId,
        'completed',
        {
          duration,
          endTime,
          ingredientId,
          jobId: String(job.id),
          jobType: JOB_TYPES.CLIP_TRIM,
          s3Key,
          startTime,
          url,
        },
      );

      return {
        jobId: String(job.id),
        jobType: JOB_TYPES.CLIP_TRIM,
        outputPath,
        s3Key,
        success: true,
        url,
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Clip trim job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      await this.publishVideoCompletion(
        ingredientId,
        job.data.userId,
        job.data.organizationId,
        'failed',
        {
          jobId: String(job.id),
          jobType: JOB_TYPES.CLIP_TRIM,
        },
        message,
      );
      throw error;
    }
  }

  async handleTextOverlay(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing text overlay for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('overlay', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.addTextOverlay(
        inputPath,
        outputPath,
        params.text || '',
        { position: params.position || 'bottom' },
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'videos',
        'video/mp4',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'overlay');
      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Text overlay job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  async handlePortraitConversion(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing portrait conversion for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('portrait', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp4');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.convertToPortrait(
        inputPath,
        outputPath,
        { height: params.height || 1920, width: params.width || 1080 },
        this.createProgressCallback(
          metadata.websocketUrl,
          authProviderUserId,
          room,
        ),
      );

      const { s3Key } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'videos',
        'video/mp4',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'portrait');
      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Portrait conversion failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  async handleVideoToAudio(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params, metadata, authProviderUserId, room } =
      job.data;
    this.logger.log(`Processing video-to-audio conversion for ${ingredientId}`);

    try {
      const tempPath = this.ffmpegService.getTempPath('audio', ingredientId);
      const inputPath = path.join(tempPath, 'input.mp4');
      const outputPath = path.join(tempPath, 'output.mp3');

      await this.downloadInput(params, inputPath);

      await this.ffmpegService.convertVideoToAudio(inputPath, outputPath, {
        audioBitrate: params.audioBitrate || '128k',
        audioCodec: params.audioCodec || 'libmp3lame',
        format: params.audioFormat || 'mp3',
      });

      const { s3Key } = await this.uploadAndEmitSuccess(
        outputPath,
        ingredientId,
        'audio',
        'audio/mpeg',
        metadata.websocketUrl,
        authProviderUserId,
        room,
      );

      this.ffmpegService.cleanupTempFiles(ingredientId, 'audio');
      return { outputPath, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Video-to-audio conversion failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      throw error;
    }
  }

  async handleExtractFrames(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(
      `Processing extract frames job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      const inputPath = params.inputPath!;
      const outputDir =
        params.outputDir ||
        this.ffmpegService.getTempPath('frames', ingredientId);

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const requestedFrameCount = params.frameCount || 5;

      // Get video duration to calculate evenly spaced frame timestamps
      const metadata = await this.ffmpegService.getVideoMetadata(inputPath);
      const duration = Number.parseFloat(metadata.format?.duration ?? '0');

      if (duration <= 0) {
        // Fallback: extract a single frame at t=0 if duration unknown
        const framePath = path.join(outputDir, 'frame_0.jpg');
        await this.ffmpegService.extractFrame(inputPath, framePath, 0);
        return { frameCount: 1, outputPath: outputDir, success: true };
      }

      // Calculate evenly spaced timestamps, avoiding the very start/end
      const frameCount = Math.min(requestedFrameCount, Math.floor(duration));
      const interval = duration / (frameCount + 1);

      for (let i = 0; i < frameCount; i++) {
        const timestamp = interval * (i + 1);
        const framePath = path.join(outputDir, `frame_${i}.jpg`);
        await this.ffmpegService.extractFrame(inputPath, framePath, timestamp);
      }

      return {
        frameCount,
        outputPath: outputDir,
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Extract frames failed for job ${job.id}:`, error);
      const message = getErrorMessage(error);
      await this.publishVideoCompletion(
        ingredientId,
        job.data.userId,
        job.data.organizationId,
        'failed',
        null,
        message,
      );
      throw error;
    }
  }

  async handleGetVideoMetadata(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, params } = job.data;
    this.logger.log(
      `Processing get video metadata job ${job.id} for ingredient ${ingredientId}`,
    );

    try {
      const videoPath = params.videoPath!;
      const metadata = await this.ffmpegService.getVideoMetadata(videoPath);

      return {
        metadata,
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Get video metadata failed for job ${job.id}:`, error);
      const message = getErrorMessage(error);
      await this.publishVideoCompletion(
        ingredientId,
        job.data.userId,
        job.data.organizationId,
        'failed',
        null,
        message,
      );
      throw error;
    }
  }

  async handleHookRemix(job: Job<VideoJobData>): Promise<JobResult> {
    this.logger.log(`Processing hook remix job ${job.id}`);

    try {
      const hookRemixData: HookRemixJobData = {
        brandId: job.data.params.s3Key || '',
        ctaVideoUrl: job.data.params.inputPath || '',
        hookDurationSeconds: job.data.params.duration || 5,
        jobId: job.data.ingredientId,
        organizationId: job.data.organizationId,
        userId: job.data.userId,
        youtubeUrl: job.data.params.videoPath || '',
      };

      const result =
        await this.hookRemixService.processHookRemix(hookRemixData);

      if (!result.success) {
        throw new Error(result.error || 'Hook remix processing failed');
      }

      return {
        duration: result.duration,
        height: result.height,
        outputPath: result.s3Url,
        s3Key: result.s3Key,
        size: result.size,
        success: true,
        width: result.width,
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Hook remix job ${job.id} failed: ${message}`);
      await this.publishVideoCompletion(
        job.data.ingredientId,
        job.data.userId,
        job.data.organizationId,
        'failed',
        null,
        message,
      );
      throw error;
    }
  }
}
