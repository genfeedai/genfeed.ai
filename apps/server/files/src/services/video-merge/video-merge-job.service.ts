import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import type {
  JobProgress,
  JobResult,
  VideoJobData,
} from '@files/shared/interfaces/job.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';

type MergeStep = NonNullable<JobProgress['step']>;
type BackgroundTaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

@Injectable()
export class VideoMergeJobService {
  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly s3Service: S3Service,
    private readonly webSocketService: WebSocketService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async process(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, metadata, authProviderUserId, room } = job.data;

    await this.publishBackgroundTaskUpdate(job, 'processing', 0);

    try {
      const tempPath = this.ffmpegService.getTempPath('merge', ingredientId);
      const inputPaths = await this.downloadVideos(job, tempPath);
      const musicPath = await this.downloadMusic(job, tempPath);
      const outputPath = path.join(tempPath, 'merged.mp4');

      await this.mergeVideos(job, inputPaths, outputPath, musicPath);
      const finalOutput = await this.resizeVideo(job, outputPath, tempPath);
      const s3Key = await this.uploadVideo(job, finalOutput);

      this.ffmpegService.cleanupTempFiles(ingredientId, 'merge');
      this.webSocketService.emitSuccess(
        metadata.websocketUrl,
        {
          ingredientId,
          s3Key,
          url: this.s3Service.getPublicUrl(s3Key),
        },
        authProviderUserId,
        room,
      );
      await this.publishBackgroundTaskUpdate(
        job,
        'completed',
        100,
        ingredientId,
      );

      return { outputPath: finalOutput, s3Key, success: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Merge job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        authProviderUserId,
        room,
      );
      await this.publishBackgroundTaskUpdate(
        job,
        'failed',
        undefined,
        undefined,
        message || 'Merge failed',
      );
      throw error;
    }
  }

  private async downloadVideos(
    job: Job<VideoJobData>,
    tempPath: string,
  ): Promise<string[]> {
    const { params } = job.data;
    const inputPaths: string[] = [];
    const totalVideos = (params.sourceIds || []).length;

    for (let index = 0; index < totalVideos; index++) {
      const sourceId = params.sourceIds?.[index];
      if (!sourceId) {
        throw new Error(`Missing source video ID at index ${index}`);
      }

      const inputPath = path.join(tempPath, `input_${index}.mp4`);
      const s3Key = this.s3Service.generateS3Key('videos', sourceId);
      await this.s3Service.downloadFile(s3Key, inputPath);
      inputPaths.push(inputPath);

      this.emitStepProgress(
        job,
        'downloading',
        ((index + 1) / totalVideos) * 100,
        ((index + 1) / totalVideos) * 30,
        `Downloading videos (${index + 1}/${totalVideos})`,
      );
    }

    return inputPaths;
  }

  private async downloadMusic(
    job: Job<VideoJobData>,
    tempPath: string,
  ): Promise<string | undefined> {
    const { music } = job.data.params;
    if (!music) {
      return undefined;
    }

    this.emitStepProgress(job, 'downloading-music', 0, 30, 'Downloading music');
    const musicPath = path.join(tempPath, 'music.mp3');
    const musicS3Key = this.s3Service.generateS3Key('audio', music);

    try {
      await this.s3Service.downloadFile(musicS3Key, musicPath);
      this.emitStepProgress(
        job,
        'downloading-music',
        100,
        35,
        'Music downloaded',
      );
      return musicPath;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to download music file: ${getErrorMessage(error)}`,
      );
      this.emitStepProgress(
        job,
        'downloading-music',
        100,
        35,
        'Music download skipped',
      );
      return undefined;
    }
  }

  private async mergeVideos(
    job: Job<VideoJobData>,
    inputPaths: string[],
    outputPath: string,
    musicPath?: string,
  ): Promise<void> {
    const { params } = job.data;
    const startProgress = musicPath ? 35 : 30;
    const endProgress = params.isResizeEnabled ? 90 : 95;

    if (musicPath) {
      const label = 'Merging videos with music';
      this.emitStepProgress(job, 'merging', 0, startProgress, label);
      await this.ffmpegService.mergeVideosWithMusic(
        inputPaths,
        outputPath,
        {
          musicPath,
          musicVolume: params.musicVolume || 0.05,
          muteVideoAudio: params.isMuteVideoAudio || false,
        },
        this.createProgressCallback(
          job,
          'merging',
          startProgress,
          endProgress,
          label,
        ),
      );
    } else if (params.transition && params.transition !== 'none') {
      const label = 'Merging videos with transitions';
      this.emitStepProgress(job, 'merging', 0, startProgress, label);
      await this.ffmpegService.mergeVideosWithTransitions(
        inputPaths,
        outputPath,
        {
          transition: params.transition,
          transitionDuration: params.transitionDuration || 0.5,
          transitionEaseCurve: params.transitionEaseCurve,
        },
        this.createProgressCallback(
          job,
          'merging',
          startProgress,
          endProgress,
          label,
        ),
      );
    } else {
      const label = 'Merging videos';
      this.emitStepProgress(job, 'merging', 0, startProgress, label);
      await this.ffmpegService.mergeVideos(
        inputPaths,
        outputPath,
        undefined,
        this.createProgressCallback(
          job,
          'merging',
          startProgress,
          endProgress,
          label,
        ),
      );
    }

    this.emitStepProgress(job, 'merging', 100, endProgress, 'Merge complete');
  }

  private async resizeVideo(
    job: Job<VideoJobData>,
    outputPath: string,
    tempPath: string,
  ): Promise<string> {
    const { params } = job.data;
    if (!params.isResizeEnabled) {
      return outputPath;
    }

    this.emitStepProgress(job, 'resizing', 0, 90, 'Resizing video');
    const resizedPath = path.join(tempPath, 'resized.mp4');
    await this.ffmpegService.convertToPortrait(
      outputPath,
      resizedPath,
      { height: params.height || 1920, width: params.width || 1080 },
      this.createProgressCallback(job, 'resizing', 90, 95, 'Resizing video'),
    );
    this.emitStepProgress(job, 'resizing', 100, 95, 'Resize complete');
    return resizedPath;
  }

  private async uploadVideo(
    job: Job<VideoJobData>,
    outputPath: string,
  ): Promise<string> {
    const { ingredientId } = job.data;
    this.emitStepProgress(job, 'uploading', 0, 95, 'Uploading merged video');
    const s3Key = this.s3Service.generateS3Key('videos', ingredientId);
    await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');
    this.emitStepProgress(job, 'uploading', 100, 100, 'Upload complete');
    return s3Key;
  }

  private createProgressCallback(
    job: Job<VideoJobData>,
    step: MergeStep,
    startProgress: number,
    endProgress: number,
    label: string,
  ): (progress: FFmpegProgress) => void {
    return (progress) => {
      const stepProgress = progress.percent || 0;
      const overallProgress =
        startProgress + (stepProgress / 100) * (endProgress - startProgress);
      this.emitStepProgress(job, step, stepProgress, overallProgress, label);
    };
  }

  private emitStepProgress(
    job: Job<VideoJobData>,
    step: MergeStep,
    stepProgress: number,
    overallProgress: number,
    currentStepLabel: string,
  ): void {
    const { metadata, authProviderUserId, room, params } = job.data;
    this.webSocketService.emitProgress(
      metadata.websocketUrl,
      {
        currentStepLabel,
        percent: overallProgress,
        step,
        stepProgress,
        totalSteps: params.isResizeEnabled ? 5 : 4,
      },
      authProviderUserId,
      room,
    );

    void this.publishBackgroundTaskUpdate(
      job,
      'processing',
      overallProgress,
    ).catch((error: unknown) => {
      this.logger.error(
        `Failed to emit background task update: ${getErrorMessage(error)}`,
      );
    });
  }

  private async publishBackgroundTaskUpdate(
    job: Job<VideoJobData>,
    status: BackgroundTaskStatus,
    progress?: number,
    resultId?: string,
    error?: string,
  ): Promise<void> {
    const { ingredientId, authProviderUserId, room } = job.data;
    if (!authProviderUserId) {
      return;
    }

    try {
      await this.redisService.publish('background-task-update', {
        activityId: ingredientId,
        error,
        label: 'Video Merge',
        progress,
        resultId,
        resultType: 'VIDEO' as const,
        room: room || getUserRoomName(authProviderUserId),
        status,
        taskId: job.id?.toString() || ingredientId,
        timestamp: new Date().toISOString(),
        userId: authProviderUserId,
      });
    } catch (publishError: unknown) {
      this.logger.error(
        `Failed to publish background task update: ${getErrorMessage(
          publishError,
        )}`,
      );
    }
  }
}
