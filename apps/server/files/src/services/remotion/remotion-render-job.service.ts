import { statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { classifyEditorRenderError } from '@files/services/remotion/editor-render-error.util';
import {
  EditorRenderCancelledError,
  RemotionRendererService,
} from '@files/services/remotion/remotion-renderer.service';
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
import { Injectable } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';

type EditorRenderResult = JobResult & IEditorRenderOutputMetadata;
type EditorRenderParams = IEditorRenderJobParams & {
  editorRender: IEditorRenderCorrelation;
};

@Injectable()
export class RemotionRenderJobService {
  constructor(
    private readonly configService: ConfigService,
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
    let lastLoggedProgress = -25;

    try {
      this.assertTrustedAssets(params.assetManifest, params.snapshot);

      if (params.editorRender.cancelRequestedAt) {
        throw new EditorRenderCancelledError();
      }

      this.logger.log('Starting editor render', {
        attempt: job.attemptsMade + 1,
        jobId: String(job.id),
        projectId: params.editorRender.projectId,
        rendererVersion: EDITOR_RENDERER_VERSION,
      });
      await this.remotionRendererService.render(
        params,
        outputPath,
        (progress) => {
          const percent = Math.round(progress * 100);
          if (percent - lastLoggedProgress >= 25) {
            lastLoggedProgress = percent;
            this.logger.log('Editor render progress', {
              jobId: String(job.id),
              percent,
              projectId: params.editorRender.projectId,
              rendererVersion: EDITOR_RENDERER_VERSION,
            });
          }
          void job.updateProgress(percent).catch((error: unknown) => {
            this.logger.warn('Failed to persist editor render progress', {
              jobId: String(job.id),
              reason: error instanceof Error ? error.name : 'unknown',
            });
          });
          this.webSocketService.emitProgress(
            metadata.websocketUrl,
            { percent },
            authProviderUserId,
            room,
          );
        },
        String(job.id),
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
          this.logger.warn('Failed to publish editor render completion event', {
            jobId: String(job.id),
            reason: error instanceof Error ? error.name : 'unknown',
          });
        });
      this.logger.log('Completed editor render', {
        jobId: String(job.id),
        projectId: params.editorRender.projectId,
        rendererVersion: EDITOR_RENDERER_VERSION,
      });
      return result;
    } catch (error: unknown) {
      await this.handleProcessFailure(error, job, params);
    } finally {
      await rm(tempPath, { force: true, recursive: true }).catch(
        (error: unknown) => {
          this.logger.warn('Failed to remove editor render temp directory', {
            jobId: String(job.id),
            reason: error instanceof Error ? error.name : 'unknown',
          });
        },
      );
    }
  }

  private async handleProcessFailure(
    error: unknown,
    job: Job<VideoJobData>,
    params: EditorRenderParams,
  ): Promise<never> {
    const {
      authProviderUserId,
      ingredientId,
      metadata,
      organizationId,
      room,
      userId,
    } = job.data;
    const classified = classifyEditorRenderError(error);
    const configuredAttempts = job.opts.attempts ?? 1;
    // BullMQ 5 increments attemptsMade in moveToFailed, after the processor
    // rejects. Inside this catch it is therefore zero-based.
    const isFinalAttempt = job.attemptsMade + 1 >= configuredAttempts;
    const isUnrecoverable = error instanceof UnrecoverableError;
    const isTerminal =
      isUnrecoverable || classified.reason === 'cancelled' || isFinalAttempt;
    this.logger.error('Editor render attempt failed', {
      attempt: job.attemptsMade + 1,
      isTerminal,
      jobId: String(job.id),
      projectId: params.editorRender.projectId,
      reason: classified.reason,
      rendererVersion: EDITOR_RENDERER_VERSION,
    });
    if (isTerminal) {
      this.webSocketService.emitError(
        metadata.websocketUrl,
        classified.publicMessage,
        authProviderUserId,
        room,
      );
      await this.redisService
        .publish('video-processing-complete', {
          editorRender: params.editorRender,
          error: classified.publicMessage,
          ingredientId,
          organizationId,
          status: 'failed',
          terminalAttempt: job.attemptsMade + 1,
          terminalReason: classified.reason,
          timestamp: new Date().toISOString(),
          userId,
        })
        .catch((publishError: unknown) => {
          this.logger.warn('Failed to publish editor render failure event', {
            jobId: String(job.id),
            reason:
              publishError instanceof Error ? publishError.name : 'unknown',
          });
        });
    }
    if (isUnrecoverable) {
      throw error;
    }
    if (classified.reason === 'cancelled') {
      throw new UnrecoverableError(classified.publicMessage);
    }
    throw error;
  }

  async requestCancellation(
    job: Job<VideoJobData>,
    requestedAt: string,
  ): Promise<IEditorRenderCorrelation> {
    const params = this.readParams(job.data);
    const editorRender = {
      ...params.editorRender,
      cancelRequestedAt: requestedAt,
    };
    await job.updateData({
      ...job.data,
      params: {
        ...job.data.params,
        editorRender,
      },
    });

    return editorRender;
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
      throw new UnrecoverableError(
        'Editor render job is missing its validated snapshot or completion correlation.',
      );
    }

    return { assetManifest, editorRender, rendererVersion, snapshot };
  }

  private assertTrustedAssets(
    assetManifest: IEditorRenderJobParams['assetManifest'],
    snapshot: IEditorRenderJobParams['snapshot'],
  ): void {
    const trustedBase = new URL(this.configService.ingredientsEndpoint);
    const trustedPath = trustedBase.pathname.replace(/\/$/, '');
    const trustedUrlByClipId = new Map(
      assetManifest.map((asset) => [asset.clipId, asset.ingredientUrl]),
    );

    for (const asset of assetManifest) {
      let url: URL;
      try {
        url = new URL(asset.ingredientUrl);
      } catch {
        throw new UnrecoverableError(
          'Editor render asset URL is not approved.',
        );
      }
      if (
        url.origin !== trustedBase.origin ||
        !url.pathname.startsWith(`${trustedPath}/`) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new UnrecoverableError(
          'Editor render asset origin is not approved.',
        );
      }
    }

    for (const track of snapshot.tracks) {
      if (track.type === 'text') {
        continue;
      }
      for (const clip of track.clips) {
        if (trustedUrlByClipId.get(clip.id) !== clip.ingredientUrl) {
          throw new UnrecoverableError(
            'Editor render snapshot contains an untrusted asset.',
          );
        }
      }
    }
  }
}
