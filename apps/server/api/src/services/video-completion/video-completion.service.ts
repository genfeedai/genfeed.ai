import { RawCutClipCompletionService } from '@api/collections/clip-projects/services/raw-cut-clip-completion.service';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  IngredientStatus,
  JobState,
  Status,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import {
  type IEditorRenderCorrelation,
  type IEditorRenderOutputMetadata,
  type IJobStatusResponse,
  parseEditorRenderOutputMetadata,
  RAW_CUT_JOB_PREFIX,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

type VideoCompletionEvent = {
  ingredientId: string;
  userId?: string;
  organizationId: string;
  status: Status.COMPLETED | Status.FAILED;
  result?: {
    s3Key?: string;
    duration?: number;
    width?: number;
    height?: number;
    dimensions?: {
      width?: number;
      height?: number;
    };
    metadata?: {
      duration?: number;
      width?: number;
      height?: number;
    };
    [key: string]: unknown;
  };
  error?: string;
  editorRender?: IEditorRenderCorrelation;
  timestamp: string;
};

const EDITOR_RENDER_STALE_MS = 45 * 60 * 1000;
const RAW_CUT_RECONCILIATION_LOCK = 'raw-cut-clip-reconciliation';
const RAW_CUT_RECONCILIATION_LOCK_TTL_SECONDS = 300;

@Injectable()
export class VideoCompletionService implements OnModuleInit {
  constructor(
    private readonly redisService: RedisService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly notificationsPublisher: NotificationsPublisherService,
    private readonly rawCutClipCompletionService: RawCutClipCompletionService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.subscribeToVideoCompletion();
  }

  private async subscribeToVideoCompletion(): Promise<void> {
    await this.redisService.subscribe(
      'video-processing-complete',
      async (data: unknown) => {
        const event = data as VideoCompletionEvent;
        this.logger.log(
          `Received video completion event for ${event.ingredientId}`,
        );

        await this.handleVideoCompletion(event);
      },
    );
    this.logger.log('Subscribed to video-processing-complete channel');
  }

  private async handleVideoCompletion(data: VideoCompletionEvent) {
    try {
      const { ingredientId, organizationId, status, result, error } = data;

      if (data.editorRender) {
        if (status === Status.COMPLETED) {
          await this.completeEditorRender(data.editorRender, result);
        } else {
          await this.failEditorRender(data.editorRender);
        }
        return;
      }

      if (this.isRawCutCompletion(data)) {
        await this.rawCutClipCompletionService.handleCompletion(data);
        return;
      }

      if (status === Status.COMPLETED) {
        const ingredientUpdate: Record<string, unknown> = {
          status: IngredientStatus.GENERATED,
        };

        if (result?.s3Key) {
          ingredientUpdate.s3Key = result.s3Key;
        }

        await this.ingredientsService.patch(ingredientId, ingredientUpdate);

        this.logger.log(
          `Updated ingredient ${ingredientId} status to COMPLETED`,
        );

        if (result?.s3Key) {
          this.logger.log(`Video processed successfully: ${result.s3Key}`);
        }

        const metadataUpdate = this.extractMetadataUpdate(result);
        if (Object.keys(metadataUpdate).length > 0) {
          await this.patchIngredientMetadata(
            ingredientId,
            organizationId,
            metadataUpdate,
          );
        }
      } else if (status === Status.FAILED) {
        // Update ingredient status to failed
        await this.ingredientsService.patch(ingredientId, {
          status: IngredientStatus.FAILED,
        });

        this.logger.error(
          `Updated ingredient ${ingredientId} status to FAILED: ${error}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to handle video completion for ${data.ingredientId}:`,
        error,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileEditorRenders(): Promise<void> {
    const projects = await this.editorProjectsService.findRenderingProjects();

    const results = await Promise.allSettled(
      projects.map(async (project) => {
        const provenance =
          this.editorProjectsService.readRenderProvenance(project);
        const editorRender = provenance?.job;
        const queuedAt = provenance?.queuedAt
          ? Date.parse(provenance.queuedAt)
          : Number.NaN;
        const isStale =
          !Number.isFinite(queuedAt) ||
          Date.now() - queuedAt >= EDITOR_RENDER_STALE_MS;

        if (!editorRender) {
          if (isStale) {
            await this.editorProjectsService.markAsFailed(project.id);
          }
          return;
        }

        let job: IJobStatusResponse;
        try {
          job = await this.fileQueueService.getJobStatus(editorRender.jobId);
        } catch (error: unknown) {
          if (isStale) {
            await this.failEditorRender(editorRender);
            return;
          }
          throw error;
        }

        if (job.state === JobState.COMPLETED) {
          await this.handleVideoCompletion({
            editorRender,
            ingredientId: editorRender.ingredientId,
            organizationId: project.organizationId,
            result: job.result as VideoCompletionEvent['result'],
            status: Status.COMPLETED,
            timestamp: new Date().toISOString(),
          });
        } else if (job.state === JobState.FAILED) {
          await this.handleVideoCompletion({
            editorRender,
            error: job.failedReason,
            ingredientId: editorRender.ingredientId,
            organizationId: project.organizationId,
            status: Status.FAILED,
            timestamp: new Date().toISOString(),
          });
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error('Failed to reconcile editor render', result.reason);
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileRawCutClips(): Promise<void> {
    await this.cacheService.withLock(
      RAW_CUT_RECONCILIATION_LOCK,
      async () => {
        await this.rawCutClipCompletionService.reconcileActiveClips();
      },
      RAW_CUT_RECONCILIATION_LOCK_TTL_SECONDS,
    );
  }

  private isRawCutCompletion(data: VideoCompletionEvent): boolean {
    const jobId = data.result?.jobId;
    return typeof jobId === 'string' && jobId.startsWith(RAW_CUT_JOB_PREFIX);
  }

  private async completeEditorRender(
    editorRender: IEditorRenderCorrelation,
    result: VideoCompletionEvent['result'],
  ): Promise<void> {
    let output: IEditorRenderOutputMetadata;
    try {
      output = parseEditorRenderOutputMetadata(result);
    } catch (error: unknown) {
      this.logger.error('Editor renderer returned invalid output', error);
      await this.failEditorRender(editorRender);
      return;
    }

    // Output records are unique to this render and these writes are idempotent.
    // Persist them before the project CAS so a transient failure remains
    // eligible for the next reconciliation pass.
    await Promise.all([
      this.ingredientsService.patch(editorRender.ingredientId, {
        s3Key: output.s3Key,
        status: IngredientStatus.GENERATED,
      }),
      this.metadataService.patch(editorRender.metadataId, {
        duration: output.durationSeconds,
        height: output.height,
        label: 'Editor Render',
        size: output.size,
        width: output.width,
      }),
    ]);
    await this.editorProjectsService.markAsCompleted(
      editorRender.projectId,
      editorRender.ingredientId,
      output,
      editorRender.jobId,
    );
    await this.notificationsPublisher.publishVideoComplete(
      WebSocketPaths.video(editorRender.ingredientId),
      {
        eventType: WebSocketEventType.VIDEO_GENERATED,
        id: editorRender.ingredientId,
        status: WebSocketEventStatus.COMPLETED,
      },
      editorRender.authProviderUserId,
      editorRender.room,
    );
  }

  private async failEditorRender(
    editorRender: IEditorRenderCorrelation,
  ): Promise<void> {
    await this.ingredientsService.patch(editorRender.ingredientId, {
      status: IngredientStatus.FAILED,
    });
    await this.editorProjectsService.markAsFailed(
      editorRender.projectId,
      editorRender.jobId,
    );
    await this.notificationsPublisher.publishMediaFailed(
      WebSocketPaths.video(editorRender.ingredientId),
      'Failed to render project. Please try again.',
      editorRender.authProviderUserId,
      editorRender.room,
    );
  }

  private extractMetadataUpdate(
    result?: VideoCompletionEvent['result'],
  ): Record<string, number> {
    if (!result) {
      return {};
    }

    const metadata = result.metadata ?? {};
    const dimensions = result.dimensions ?? {};

    const duration = this.getNumericValue(result.duration, metadata.duration);
    const width = this.getNumericValue(
      result.width,
      dimensions.width,
      metadata.width,
    );
    const height = this.getNumericValue(
      result.height,
      dimensions.height,
      metadata.height,
    );

    return {
      ...(duration !== undefined ? { duration } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  }

  private getNumericValue(
    ...values: Array<number | undefined>
  ): number | undefined {
    return values.find((value) => typeof value === 'number');
  }

  private async patchIngredientMetadata(
    ingredientId: string,
    organizationId: string,
    metadataUpdate: Record<string, number>,
  ): Promise<void> {
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      isDeleted: false,
      organization: organizationId,
    });

    const metadataId =
      ingredient?.metadata && typeof ingredient.metadata === 'string'
        ? ingredient.metadata
        : ingredient?.metadata &&
            typeof ingredient.metadata === 'object' &&
            '_id' in ingredient.metadata
          ? String((ingredient.metadata as { id: string }).id)
          : undefined;

    if (!metadataId) {
      this.logger.warn(
        `Metadata not found for completed ingredient ${ingredientId}`,
        metadataUpdate,
      );
      return;
    }

    await this.metadataService.patch(metadataId, metadataUpdate);
  }
}
