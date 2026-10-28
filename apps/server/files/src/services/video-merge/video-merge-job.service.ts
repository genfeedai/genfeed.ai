import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FFmpegBeatDetectionService } from '@files/services/ffmpeg/services/ffmpeg-beat-detection.service';
import { S3Service } from '@files/services/s3/s3.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import type {
  JobProgress,
  JobResult,
  VideoJobData,
} from '@files/shared/interfaces/job.interface';
import { BeatSyncCutStrategy } from '@genfeedai/contracts';
import {
  BEAT_SYNC_MIN_CONFIDENCE,
  planBeatSyncedCuts,
  selectCutBeats,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { assertSafeObjectKey } from '@libs/security';
import { assertStoredObjectKey } from '@libs/security/stored-object-key';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable, Optional } from '@nestjs/common';
import type { Job } from 'bullmq';
import sharp from 'sharp';

/** Below one frame at 30 fps a trim is not worth a re-encode. */
const BEAT_SYNC_MIN_TRIM_SECONDS = 1 / 30;
const END_CARD_MAX_BYTES = 20 * 1024 * 1024;
const END_CARD_MAX_PIXELS = 40_000_000;

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
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    private readonly beatDetectionService?: FFmpegBeatDetectionService,
  ) {}

  async process(job: Job<VideoJobData>): Promise<JobResult> {
    const { ingredientId, metadata, userId, room } = job.data;

    await this.publishBackgroundTaskUpdate(job, 'processing', 0);

    try {
      const tempPath = this.ffmpegService.getTempPath('merge', ingredientId);
      const inputPaths = await this.downloadVideos(job, tempPath);
      const musicPath = await this.downloadMusic(job, tempPath);
      const outputPath = path.join(tempPath, 'merged.mp4');

      const beatSync = await this.applyBeatSync(
        job,
        inputPaths,
        musicPath,
        tempPath,
      );
      await this.mergeVideos(job, beatSync.paths, outputPath, musicPath);
      const mergedOutput = await this.resizeVideo(job, outputPath, tempPath);
      const finalOutput = await this.appendEndCard(job, mergedOutput, tempPath);
      const probe = await this.ffmpegService.probe(finalOutput);
      const videoStream = probe.streams.find(
        (stream) => stream.codec_type === 'video',
      );
      const s3Key = await this.uploadVideo(job, finalOutput);

      await this.ffmpegService.cleanupTempFiles(
        ...inputPaths,
        ...beatSync.trimmedPaths,
        ...(job.data.params.isPersistedOutputOnly ? [finalOutput] : []),
        ...(mergedOutput !== outputPath ? [outputPath] : []),
        ...(finalOutput !== mergedOutput ? [mergedOutput] : []),
        ...(musicPath ? [musicPath] : []),
      );
      this.webSocketService.emitSuccess(
        metadata.websocketUrl,
        {
          ingredientId,
          s3Key,
          url: this.s3Service.getPublicUrl(s3Key),
        },
        userId,
        room,
      );
      await this.publishBackgroundTaskUpdate(
        job,
        'completed',
        100,
        ingredientId,
      );

      return {
        ...(job.data.params.isPersistedOutputOnly
          ? {}
          : { outputPath: finalOutput }),
        s3Key,
        url: this.s3Service.getPublicUrl(s3Key),
        success: true,
        isBeatSynced: beatSync.isSynced,
        duration: Number(probe.format.duration),
        size: Number(probe.format.size),
        width: videoStream?.width,
        height: videoStream?.height,
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Merge job failed: ${message}`);
      this.webSocketService.emitError(
        metadata.websocketUrl,
        message,
        userId,
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
    if (totalVideos < 1)
      throw new Error('Video merge requires at least one source');
    if (
      params.sourceStorageKeys &&
      params.sourceStorageKeys.length !== totalVideos
    ) {
      throw new Error('Stored video keys must match the ordered source IDs');
    }
    if (
      this.configService?.isAuthorizedMediaDeliveryEnabled &&
      !params.sourceStorageKeys
    ) {
      throw new Error(
        'Authorized video merge requires canonical source storage keys',
      );
    }
    const keys = params.sourceStorageKeys?.map((key) => {
      const safeKey = this.configService?.isAuthorizedMediaDeliveryEnabled
        ? assertStoredObjectKey(key, (message) => new Error(message))
        : assertSafeObjectKey(key, (message) => new Error(message));
      if (
        !safeKey.startsWith('ingredients/videos/') &&
        !safeKey.startsWith('ingredients/avatars/')
      )
        throw new Error('Merge sources must use video storage keys');
      return safeKey;
    });

    for (let index = 0; index < totalVideos; index++) {
      const sourceId = params.sourceIds?.[index];
      if (!sourceId) {
        throw new Error(`Missing source video ID at index ${index}`);
      }

      const inputPath = path.join(tempPath, `input_${index}.mp4`);
      const s3Key =
        keys?.[index] ?? this.s3Service.generateS3Key('videos', sourceId);
      if (this.configService?.isAuthorizedMediaDeliveryEnabled) {
        const url = await this.s3Service.getPresignedDownloadUrlForStoredKey(
          s3Key,
          300,
        );
        await this.s3Service.downloadFromUrl(
          url,
          inputPath,
          1024 * 1024 * 1024,
        );
      } else {
        await this.s3Service.downloadFile(s3Key, inputPath);
      }
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
    const { music, musicStorageKey } = job.data.params;
    if (!music) {
      return undefined;
    }

    this.emitStepProgress(job, 'downloading-music', 0, 30, 'Downloading music');
    const musicPath = path.join(tempPath, 'music.mp3');
    if (
      this.configService?.isAuthorizedMediaDeliveryEnabled &&
      !musicStorageKey
    ) {
      throw new Error(
        'Authorized video merge requires a canonical music storage key',
      );
    }
    const musicS3Key = musicStorageKey
      ? this.configService?.isAuthorizedMediaDeliveryEnabled
        ? assertStoredObjectKey(
            musicStorageKey,
            (message) => new Error(message),
          )
        : assertSafeObjectKey(musicStorageKey, (message) => new Error(message))
      : this.s3Service.generateS3Key('audio', music);
    if (
      musicStorageKey &&
      !/^ingredients\/(musics|audio|audios)\/.+/.test(musicS3Key)
    ) {
      throw new Error('Merge music must use an audio storage key');
    }

    try {
      if (this.configService?.isAuthorizedMediaDeliveryEnabled) {
        const url = await this.s3Service.getPresignedDownloadUrlForStoredKey(
          musicS3Key,
          300,
        );
        await this.s3Service.downloadFromUrl(
          url,
          musicPath,
          1024 * 1024 * 1024,
        );
      } else {
        await this.s3Service.downloadFile(musicS3Key, musicPath);
      }
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

  /**
   * Trims the end of each clip so every cut lands on a beat of the music.
   * Without music, or when the music has no steady pulse to cut on, the clips
   * are joined as they are: a synced edit is a refinement, not a reason to
   * fail the merge.
   */
  private async applyBeatSync(
    job: Job<VideoJobData>,
    inputPaths: string[],
    musicPath: string | undefined,
    tempPath: string,
  ): Promise<{
    isSynced: boolean;
    paths: string[];
    trimmedPaths: string[];
  }> {
    const { isBeatSyncEnabled, beatSyncCutStrategy } = job.data.params;
    const unsynced = { isSynced: false, paths: inputPaths, trimmedPaths: [] };
    if (!isBeatSyncEnabled) {
      return unsynced;
    }
    if (!musicPath) {
      this.logger.warn('Beat sync needs music; joining the clips as they are');
      return unsynced;
    }
    if (!this.beatDetectionService) {
      throw new Error('Beat sync is not available on this worker');
    }

    this.emitStepProgress(
      job,
      'merging',
      0,
      35,
      'Finding the beat of the music',
    );
    let analysis: Awaited<
      ReturnType<FFmpegBeatDetectionService['analyzeBeat']>
    >;
    try {
      analysis = await this.beatDetectionService.analyzeBeat(musicPath);
    } catch (error: unknown) {
      this.logger.warn(
        `Beat analysis failed; joining the clips as they are: ${getErrorMessage(error)}`,
      );
      return unsynced;
    }
    if (!analysis || analysis.confidence < BEAT_SYNC_MIN_CONFIDENCE) {
      this.logger.warn(
        'The music has no steady beat to cut on; joining the clips as they are',
      );
      return unsynced;
    }

    const durations: number[] = [];
    for (const inputPath of inputPaths) {
      const probe = await this.ffmpegService.probe(inputPath);
      durations.push(Number(probe.format.duration));
    }
    const plan = planBeatSyncedCuts(
      durations,
      selectCutBeats(
        analysis,
        beatSyncCutStrategy ?? BeatSyncCutStrategy.EVERY_BEAT,
      ),
    );

    const paths: string[] = [];
    const trimmedPaths: string[] = [];
    for (const [index, clip] of plan.entries()) {
      // Under a frame of difference is not worth a re-encode.
      if (
        durations[index] - clip.durationSeconds <
        BEAT_SYNC_MIN_TRIM_SECONDS
      ) {
        paths.push(inputPaths[index]);
        continue;
      }
      const trimmedPath = path.join(tempPath, `beat_${index}.mp4`);
      await this.ffmpegService.trimVideoToDuration(
        inputPaths[index],
        trimmedPath,
        clip.durationSeconds,
      );
      paths.push(trimmedPath);
      trimmedPaths.push(trimmedPath);
    }
    this.logger.log(
      `Beat sync: ${analysis.tempo} BPM, ${trimmedPaths.length}/${plan.length} clips trimmed, ${plan.filter((clip) => !clip.isOnBeat).length} off the beat`,
    );
    return { isSynced: true, paths, trimmedPaths };
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

    if (params.normalizeClips) {
      if (musicPath)
        throw new Error('Scene composition cannot include source music');
      await this.ffmpegService.mergeNormalizedVideos(
        inputPaths,
        outputPath,
        params.width ?? 1080,
        params.height ?? 1920,
      );
    } else if (musicPath) {
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
    } else if (
      params.transition &&
      params.transition !== 'none' &&
      String(params.transition) !== 'cut'
    ) {
      const label = 'Merging videos with transitions';
      this.emitStepProgress(job, 'merging', 0, startProgress, label);
      await this.ffmpegService.mergeVideosWithTransitions(
        inputPaths,
        outputPath,
        {
          ...(params.isMuteVideoAudio ? { muteVideoAudio: true } : {}),
          transition: params.transition,
          transitionDuration: params.transitionDuration || 0.5,
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
        params.isMuteVideoAudio ? { muteVideoAudio: true } : undefined,
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

  /**
   * Closes the finished video with the brand's end card. The API resolved and
   * validated the stored image; here it is fitted to the video's own frame so
   * the join keeps the original untouched.
   */
  private async appendEndCard(
    job: Job<VideoJobData>,
    videoPath: string,
    tempPath: string,
  ): Promise<string> {
    const { endCardBackgroundColor, endCardDuration, endCardStorageKey } =
      job.data.params;
    if (!endCardStorageKey) {
      return videoPath;
    }
    if (
      !Number.isFinite(endCardDuration) ||
      !/^#[0-9a-fA-F]{6}$/.test(endCardBackgroundColor ?? '')
    ) {
      throw new Error('End card needs a duration and a background color');
    }

    this.emitStepProgress(
      job,
      'adding-end-card',
      0,
      95,
      'Adding the brand end card',
    );
    const storageKey = this.configService?.isAuthorizedMediaDeliveryEnabled
      ? assertStoredObjectKey(
          endCardStorageKey,
          (message) => new Error(message),
        )
      : assertSafeObjectKey(endCardStorageKey, (message) => new Error(message));
    const downloadedPath = path.join(tempPath, 'end-card-source');
    if (this.configService?.isAuthorizedMediaDeliveryEnabled) {
      const url = await this.s3Service.getPresignedDownloadUrlForStoredKey(
        storageKey,
        300,
      );
      await this.s3Service.downloadFromUrl(
        url,
        downloadedPath,
        END_CARD_MAX_BYTES,
      );
    } else {
      await this.s3Service.downloadFile(storageKey, downloadedPath);
    }

    const probe = await this.ffmpegService.probe(videoPath);
    const videoStream = probe.streams.find(
      (stream) => stream.codec_type === 'video',
    );
    if (!videoStream?.width || !videoStream.height) {
      throw new Error('End card needs a video with dimensions');
    }
    const width = videoStream.width - (videoStream.width % 2);
    const height = videoStream.height - (videoStream.height % 2);

    // Flatten transparency and fix orientation here, once, so the encoder only
    // ever sees an opaque image at the video's own size.
    const cardPath = path.join(tempPath, 'end-card.png');
    await sharp(downloadedPath, { limitInputPixels: END_CARD_MAX_PIXELS })
      .rotate()
      .resize(width, height, {
        background: endCardBackgroundColor,
        fit: 'contain',
      })
      .flatten({ background: endCardBackgroundColor })
      .png()
      .toFile(cardPath);

    const outputPath = path.join(tempPath, 'with-end-card.mp4');
    await this.ffmpegService.appendEndCard(
      videoPath,
      cardPath,
      outputPath,
      { durationSeconds: endCardDuration as number },
      this.createProgressCallback(
        job,
        'adding-end-card',
        95,
        96,
        'Adding the brand end card',
      ),
    );
    await this.ffmpegService.cleanupTempFiles(downloadedPath, cardPath);
    this.emitStepProgress(job, 'adding-end-card', 100, 96, 'End card added');
    return outputPath;
  }

  private async uploadVideo(
    job: Job<VideoJobData>,
    outputPath: string,
  ): Promise<string> {
    const { ingredientId } = job.data;
    this.emitStepProgress(job, 'uploading', 0, 95, 'Uploading merged video');
    const requestedKey = this.s3Service.generateS3Key(
      'videos',
      this.configService?.isAuthorizedMediaDeliveryEnabled
        ? randomUUID()
        : ingredientId,
    );
    const uploaded = await this.s3Service.uploadFile(
      requestedKey,
      outputPath,
      'video/mp4',
    );
    if (this.configService?.isAuthorizedMediaDeliveryEnabled && !uploaded?.Key)
      throw new Error('Merged upload returned no stored key');
    const s3Key = uploaded?.Key ?? requestedKey;
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
    const { metadata, userId, room, params } = job.data;
    this.webSocketService.emitProgress(
      metadata.websocketUrl,
      {
        currentStepLabel,
        percent: overallProgress,
        step,
        stepProgress,
        totalSteps:
          (params.isResizeEnabled ? 5 : 4) + (params.endCardStorageKey ? 1 : 0),
      },
      userId,
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
    const { ingredientId, userId, room } = job.data;
    if (!userId) {
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
        room: room || getUserRoomName(userId),
        status,
        taskId: job.id?.toString() || ingredientId,
        timestamp: new Date().toISOString(),
        userId,
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
