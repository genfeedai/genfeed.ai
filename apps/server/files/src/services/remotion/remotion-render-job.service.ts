import { statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { RemotionRendererService } from '@files/services/remotion/remotion-renderer.service';
import { S3Service } from '@files/services/s3/s3.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import type {
  JobResult,
  VideoJobData,
} from '@files/shared/interfaces/job.interface';
import {
  EDITOR_RENDERER_VERSION,
  type IEditorRenderCorrelation,
  type IEditorRenderJobParams,
  type IEditorRenderOutputMetadata,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';

type EditorRenderResult = JobResult & IEditorRenderOutputMetadata;
type EditorRenderParams = IEditorRenderJobParams & {
  editorRender: IEditorRenderCorrelation;
};

@Injectable()
export class RemotionRenderJobService {
  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly remotionRendererService: RemotionRendererService,
    private readonly s3Service: S3Service,
    private readonly webSocketService: WebSocketService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async process(job: Job<VideoJobData>): Promise<EditorRenderResult> {
    const {
      authProviderUserId,
      ingredientId,
      metadata,
      organizationId,
      room,
      userId,
    } = job.data;
    const params = this.readParams(job.data);
    const tempPath = this.ffmpegService.getTempPath(
      'editor-render',
      `${ingredientId}-${job.id}`,
    );
    const outputPath = path.join(tempPath, 'composition.mp4');

    try {
      await this.remotionRendererService.render(
        params,
        outputPath,
        (progress) => {
          const percent = Math.round(progress * 100);
          void job.updateProgress(percent).catch((error: unknown) => {
            this.logger.warn('Failed to persist editor render progress', error);
          });
          this.webSocketService.emitProgress(
            metadata.websocketUrl,
            { percent },
            authProviderUserId,
            room,
          );
        },
      );

      const s3Key = this.s3Service.generateS3Key('videos', ingredientId);
      await this.s3Service.uploadFile(s3Key, outputPath, 'video/mp4');
      const url = this.s3Service.getPublicUrl(s3Key);
      const result: EditorRenderResult = {
        durationFrames: params.snapshot.totalDurationFrames,
        durationSeconds:
          params.snapshot.totalDurationFrames / params.snapshot.settings.fps,
        fps: params.snapshot.settings.fps,
        height: params.snapshot.settings.height,
        rendererVersion: EDITOR_RENDERER_VERSION,
        s3Key,
        size: statSync(outputPath).size,
        success: true,
        url,
        width: params.snapshot.settings.width,
      };

      this.webSocketService.emitSuccess(
        metadata.websocketUrl,
        { ingredientId, s3Key, url },
        authProviderUserId,
        room,
      );
      await this.redisService
        .publish('video-processing-complete', {
          editorRender: params.editorRender,
          ingredientId,
          organizationId,
          result,
          status: 'completed',
          timestamp: new Date().toISOString(),
          userId,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            'Failed to publish editor render completion event',
            error,
          );
        });
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Editor Remotion render failed: ${message}`);
      const configuredAttempts = job.opts.attempts ?? 1;
      // BullMQ 5 increments attemptsMade in moveToFailed, after the processor
      // rejects. Inside this catch it is therefore zero-based.
      const isFinalAttempt = job.attemptsMade + 1 >= configuredAttempts;
      if (isFinalAttempt) {
        this.webSocketService.emitError(
          metadata.websocketUrl,
          message,
          authProviderUserId,
          room,
        );
        await this.redisService
          .publish('video-processing-complete', {
            editorRender: params.editorRender,
            error: message,
            ingredientId,
            organizationId,
            status: 'failed',
            timestamp: new Date().toISOString(),
            userId,
          })
          .catch((publishError: unknown) => {
            this.logger.warn(
              'Failed to publish editor render failure event',
              publishError,
            );
          });
      }
      throw error;
    } finally {
      await rm(tempPath, { force: true, recursive: true }).catch(
        (error: unknown) => {
          this.logger.warn(
            'Failed to remove editor render temp directory',
            error,
          );
        },
      );
    }
  }

  private readParams(data: VideoJobData): EditorRenderParams {
    const { assetManifest, editorRender, rendererVersion, snapshot } =
      data.params;

    if (
      !assetManifest ||
      !editorRender ||
      !snapshot ||
      rendererVersion !== EDITOR_RENDERER_VERSION
    ) {
      throw new Error(
        'Editor render job is missing its validated snapshot or completion correlation.',
      );
    }

    return { assetManifest, editorRender, rendererVersion, snapshot };
  }
}
