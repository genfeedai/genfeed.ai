import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { scopedWhere } from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type {
  VideoStitchContext,
  VideoStitchHandle,
  VideoStitchOutcome,
  VideoStitchOutputRow,
  VideoStitchPlan,
  VideoStitchRef,
  VideoStitchRequest,
  VideoStitchState,
} from '@api/services/video-stitch/video-stitch.types';
import {
  buildVideoStitchJobParams,
  readVideoMergeSettings,
  resolveStitchClipStorageKey,
  stitchRequestError,
  validateVideoStitchRequest,
} from '@api/services/video-stitch/video-stitch.util';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CaptionFormat,
  CaptionLanguage,
  IngredientCategory,
  IngredientStatus,
  JobState,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/contracts';
import {
  VIDEO_STITCH_CALLER_KINDS,
  VIDEO_STITCH_GENERATION_SOURCE_PREFIX,
  type VideoStitchCallerKind,
  videoStitchGenerationSource,
  videoStitchJobId,
} from '@genfeedai/contracts/interfaces';
import { FILE_JOB_TYPES } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { assertSafeObjectKey } from '@libs/security';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const STITCH_JOB_TIMEOUT_MS = 300_000;
const CAPTIONS_JOB_TIMEOUT_MS = 180_000;
const OUTPUT_SELECT = {
  _count: { select: { sources: true } },
  brandId: true,
  generationError: true,
  generationSource: true,
  id: true,
  mergeSettings: true,
  metadataId: true,
  s3Key: true,
  status: true,
  userId: true,
} as const;

const persistedStitchResult = z.object({
  duration: z.number().positive().optional(),
  height: z.number().positive().optional(),
  s3Key: z
    .string()
    .min(1)
    .refine((key) => key.startsWith('ingredients/videos/')),
  size: z.number().positive().optional(),
  success: z.literal(true),
  width: z.number().positive().optional(),
});

const captionsResult = z.object({
  s3Key: z
    .string()
    .min(1)
    .refine((key) => key.startsWith('ingredients/videos/')),
});

type PersistedStitchResult = z.infer<typeof persistedStitchResult>;

function toState(status: string): VideoStitchState {
  if (status === IngredientStatus.FAILED) return 'failed';
  if (
    status === IngredientStatus.GENERATED ||
    status === IngredientStatus.VALIDATED
  )
    return 'generated';
  return 'processing';
}

function readCallerKind(
  generationSource: string | null,
): VideoStitchCallerKind | undefined {
  const kind = generationSource?.startsWith(
    VIDEO_STITCH_GENERATION_SOURCE_PREFIX,
  )
    ? generationSource.slice(VIDEO_STITCH_GENERATION_SOURCE_PREFIX.length)
    : undefined;
  return VIDEO_STITCH_CALLER_KINDS.find((candidate) => candidate === kind);
}

/**
 * The single path that joins clips into one video (#5460). Storyboard and
 * hand-picked merge, interpolation auto-merge, the workflow stitch step and
 * storyboard-run assembly all create their output, merge job, lineage,
 * activity and socket events here.
 *
 * Callers pick how they wait: `trackInBackground` (HTTP and webhook callers),
 * `waitForCompletion` (workflow steps) or `settle` (step machines that poll).
 * Completion and failure are conditional on the output still processing, so
 * two of them racing settle it once.
 */
@Injectable()
export class VideoStitchService {
  private readonly logContext = 'VideoStitchService';

  constructor(
    private readonly activityRecorder: ActivityRecorderService,
    private readonly captionsService: CaptionsService,
    private readonly fileQueueService: FileQueueService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly whisperService: WhisperService,
  ) {}

  /**
   * Validates, creates the processing output and queues its merge job. A
   * repeated idempotency key returns the existing output untouched.
   */
  async stitch(request: VideoStitchRequest): Promise<VideoStitchHandle> {
    validateVideoStitchRequest(request);
    const existing = await this.findByKey(
      request.organizationId,
      request.idempotencyKey,
    );
    if (existing) {
      return this.toHandle(request.organizationId, existing, true);
    }

    const plan = await this.plan(request);
    const { ingredientData } =
      await this.sharedService.createMediaDocumentsInternal({
        brandId: request.brandId,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        generationSource: videoStitchGenerationSource(request.callerKind),
        mergeSettings: plan.settings,
        order: 1,
        organizationId: request.organizationId,
        ...(request.parentId ? { parentId: request.parentId } : {}),
        ...(request.providerData ? { providerData: request.providerData } : {}),
        sourceActionId: request.idempotencyKey,
        sourceIds: plan.clipIds,
        status: IngredientStatus.PROCESSING,
        transformations: [TransformationCategory.MERGED],
        userId: request.userId,
      });
    const outputId = String(ingredientData.id);

    // Two concurrent requests with one key both miss the lookup; the oldest
    // output wins and the other is withdrawn before anything is queued.
    const winner = await this.findByKey(
      request.organizationId,
      request.idempotencyKey,
    );
    if (winner && winner.id !== outputId) {
      await this.prisma.ingredient.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(request.organizationId, { id: outputId }),
      });
      return this.toHandle(request.organizationId, winner, true);
    }

    const context = this.contextFromRequest(request, outputId, plan);
    await this.recordProcessing(context, false);
    await this.enqueue(request, plan, context);
    return {
      isExisting: false,
      jobId: context.jobId,
      organizationId: request.organizationId,
      outputId,
      roomUserId: context.roomUserId,
      state: 'processing',
    };
  }

  /**
   * The caller's decision to retry a failed output: revalidates the same
   * request and requeues its job under the same id.
   */
  async retry(
    request: VideoStitchRequest,
    handle: VideoStitchRef,
  ): Promise<VideoStitchHandle> {
    validateVideoStitchRequest(request);
    const plan = await this.plan(request);
    const reopened = await this.prisma.ingredient.updateMany({
      data: { generationError: null, status: IngredientStatus.PROCESSING },
      where: scopedWhere(handle.organizationId, {
        id: handle.outputId,
        status: IngredientStatus.FAILED,
      }),
    });
    const output = await this.requireOutput(
      handle.organizationId,
      handle.outputId,
    );
    if (reopened.count !== 1) {
      // Nothing to retry: keep the job the caller is already tracking.
      return {
        ...this.toHandle(handle.organizationId, output, true),
        jobId: handle.jobId,
        ...(handle.roomUserId ? { roomUserId: handle.roomUserId } : {}),
      };
    }
    const context = this.contextFromRequest(request, handle.outputId, plan);
    await this.recordProcessing(context, true);
    await this.enqueue(request, plan, context);
    return {
      isExisting: true,
      jobId: context.jobId,
      organizationId: handle.organizationId,
      outputId: handle.outputId,
      roomUserId: context.roomUserId,
      state: 'processing',
    };
  }

  /** Completes the output off the request path; failures settle it failed. */
  trackInBackground(handle: VideoStitchRef): void {
    void this.waitForCompletion(handle).catch((error: unknown) => {
      this.loggerService.error(`${this.logContext} tracking failed`, {
        error: getErrorMessage(error),
        jobId: handle.jobId,
        organizationId: handle.organizationId,
        outputId: handle.outputId,
      });
    });
  }

  /** Waits for the merge job, then completes or fails the output. */
  async waitForCompletion(
    handle: VideoStitchRef,
    timeoutMs: number = STITCH_JOB_TIMEOUT_MS,
  ): Promise<VideoStitchOutcome> {
    const output = await this.requireOutput(
      handle.organizationId,
      handle.outputId,
    );
    if (toState(output.status) !== 'processing') {
      return this.toOutcome(handle.jobId, output);
    }
    const context = this.contextFromOutput(output, handle);
    try {
      const result = await this.fileQueueService.waitForJob(
        handle.jobId,
        timeoutMs,
      );
      return await this.complete(context, result);
    } catch (error: unknown) {
      return this.fail(context, error);
    }
  }

  /**
   * Reads the merge job once without waiting and settles the output when the
   * job has finished.
   */
  async settle(handle: VideoStitchRef): Promise<VideoStitchOutcome> {
    const output = await this.requireOutput(
      handle.organizationId,
      handle.outputId,
    );
    if (toState(output.status) !== 'processing') {
      return this.toOutcome(handle.jobId, output);
    }
    const context = this.contextFromOutput(output, handle);
    const status = await this.fileQueueService.getJobStatus(handle.jobId);
    if (status.state === JobState.FAILED) {
      return this.fail(context, new Error(status.failedReason || 'Job failed'));
    }
    if (status.state !== JobState.COMPLETED) {
      return { jobId: handle.jobId, outputId: output.id, state: 'processing' };
    }
    try {
      return await this.complete(context, status.result);
    } catch (error: unknown) {
      return this.fail(context, error);
    }
  }

  private async plan(request: VideoStitchRequest): Promise<VideoStitchPlan> {
    const uniqueIds = [...new Set(request.clipIds)];
    const clips = await this.prisma.ingredient.findMany({
      select: { category: true, id: true, s3Key: true },
      where: scopedWhere(request.organizationId, {
        brandId: request.brandId,
        category: {
          in: [
            CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VIDEO),
            CategoryPrismaUtil.toIngredientCategory(IngredientCategory.AVATAR),
          ],
        },
        id: { in: uniqueIds },
        // Finished media, or a draft whose media is already stored.
        OR: [
          {
            status: {
              in: [
                IngredientStatus.GENERATED,
                IngredientStatus.VALIDATED,
                IngredientStatus.UPLOADED,
              ],
            },
          },
          { s3Key: { not: null }, status: IngredientStatus.DRAFT },
        ],
      }),
    });
    if (clips.length !== uniqueIds.length) {
      throw stitchRequestError(
        'clipIds',
        `Found ${clips.length} of ${uniqueIds.length} videos ready to merge`,
        'Videos not available',
      );
    }

    const { settings } = request;
    if (settings.music) {
      const music = await this.prisma.ingredient.findFirst({
        select: { id: true },
        where: scopedWhere(request.organizationId, {
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.MUSIC,
          ),
          id: settings.music,
        }),
      });
      if (!music) {
        throw stitchRequestError('music', 'Music asset is not available');
      }
    }

    const byId = new Map(clips.map((clip) => [clip.id, clip]));
    return {
      clipIds: request.clipIds,
      ...(request.output ? { output: request.output } : {}),
      settings,
      sourceStorageKeys: request.clipIds.map((id) => {
        const clip = byId.get(id);
        if (!clip) {
          throw stitchRequestError('clipIds', 'Clip is not available');
        }
        return resolveStitchClipStorageKey(clip);
      }),
    };
  }

  private async enqueue(
    request: VideoStitchRequest,
    plan: VideoStitchPlan,
    context: VideoStitchContext,
  ): Promise<void> {
    try {
      await this.fileQueueService.processVideo({
        id: context.jobId,
        ingredientId: context.outputId,
        organizationId: context.organizationId,
        params: buildVideoStitchJobParams(plan),
        room: getUserRoomName(context.roomUserId),
        type: FILE_JOB_TYPES.MERGE_VIDEOS,
        userId: context.userId,
        websocketUrl: WebSocketPaths.video(context.outputId),
      });
    } catch (error: unknown) {
      await this.fail(context, error);
      throw error;
    }
    this.loggerService.log(`${this.logContext} stitch queued`, {
      callerKind: request.callerKind,
      clipCount: plan.clipIds.length,
      jobId: context.jobId,
      organizationId: context.organizationId,
      outputId: context.outputId,
    });
  }

  private async complete(
    context: VideoStitchContext,
    rawResult: unknown,
  ): Promise<VideoStitchOutcome> {
    const parsed = persistedStitchResult.safeParse(rawResult);
    if (!parsed.success) {
      throw new Error('Video merge did not return a persisted video');
    }
    const result = parsed.data;
    assertSafeObjectKey(result.s3Key, (message) => new Error(message));
    const s3Key = await this.addCaptionsIfEnabled(context, result.s3Key);

    await this.patchMetadata(context, result, s3Key);
    const completed = await this.prisma.ingredient.updateMany({
      data: {
        generationError: null,
        s3Key,
        status: IngredientStatus.GENERATED,
        transformations: [TransformationCategory.MERGED],
      },
      where: scopedWhere(context.organizationId, {
        id: context.outputId,
        status: IngredientStatus.PROCESSING,
      }),
    });
    if (completed.count !== 1) {
      const output = await this.requireOutput(
        context.organizationId,
        context.outputId,
      );
      return this.toOutcome(context.jobId, output);
    }

    const room = getUserRoomName(context.roomUserId);
    const label = `Merged ${context.clipCount} videos`;
    await this.websocketService.publishVideoComplete(
      WebSocketPaths.video(context.outputId),
      {
        eventType: WebSocketEventType.VIDEO_MERGED,
        id: context.outputId,
        status: WebSocketEventStatus.COMPLETED,
        transformation: TransformationCategory.MERGED,
      },
      context.roomUserId,
      room,
    );
    await this.activityRecorder.update(
      {
        id: this.activityId(context.outputId),
        organizationId: context.organizationId,
      },
      {
        key: ActivityKey.VIDEO_COMPLETED,
        value: this.activityValue(context, label, {
          progress: 100,
          resultId: context.outputId,
          resultType: 'VIDEO',
        }),
      },
    );
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: this.activityId(context.outputId),
      label,
      progress: 100,
      resultId: context.outputId,
      resultType: 'VIDEO',
      room,
      status: 'completed',
      taskId: context.outputId,
      userId: context.roomUserId,
    });
    this.loggerService.log(`${this.logContext} stitch completed`, {
      callerKind: context.callerKind,
      jobId: context.jobId,
      organizationId: context.organizationId,
      outputId: context.outputId,
    });
    return {
      jobId: context.jobId,
      outputId: context.outputId,
      s3Key,
      state: 'generated',
    };
  }

  private async fail(
    context: VideoStitchContext,
    error: unknown,
  ): Promise<VideoStitchOutcome> {
    const message = getErrorMessage(error) || 'Unknown error occurred';
    this.loggerService.error(`${this.logContext} stitch failed`, {
      callerKind: context.callerKind,
      error: message,
      jobId: context.jobId,
      organizationId: context.organizationId,
      outputId: context.outputId,
    });
    const failed = await this.prisma.ingredient.updateMany({
      data: { generationError: message, status: IngredientStatus.FAILED },
      where: scopedWhere(context.organizationId, {
        id: context.outputId,
        status: IngredientStatus.PROCESSING,
      }),
    });
    const outcome: VideoStitchOutcome = {
      error: message,
      jobId: context.jobId,
      outputId: context.outputId,
      state: 'failed',
    };
    if (failed.count !== 1) {
      return outcome;
    }

    const room = getUserRoomName(context.roomUserId);
    await this.websocketService.publishMediaFailed(
      WebSocketPaths.video(context.outputId),
      `Failed to merge videos: ${message}`,
      context.roomUserId,
      room,
    );
    await this.activityRecorder.update(
      {
        id: this.activityId(context.outputId),
        organizationId: context.organizationId,
      },
      {
        key: ActivityKey.VIDEO_FAILED,
        value: this.activityValue(context, 'Merge failed', { error: message }),
      },
    );
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: this.activityId(context.outputId),
      error: message,
      label: 'Merge failed',
      room,
      status: 'failed',
      taskId: context.outputId,
      userId: context.roomUserId,
    });
    return outcome;
  }

  private async recordProcessing(
    context: VideoStitchContext,
    isRetry: boolean,
  ): Promise<void> {
    const label = `Merging ${context.clipCount} videos`;
    const activityId = this.activityId(context.outputId);
    if (isRetry) {
      // A retry reopens the output's deterministic activity row.
      await this.activityRecorder.update(
        { id: activityId, organizationId: context.organizationId },
        {
          key: ActivityKey.VIDEO_PROCESSING,
          value: this.activityValue(context, label),
        },
      );
    } else {
      await this.activityRecorder.record({
        brandId: context.brandId,
        entityId: context.outputId,
        entityModel: ActivityEntityModel.INGREDIENT,
        id: activityId,
        key: ActivityKey.VIDEO_PROCESSING,
        organizationId: context.organizationId,
        source:
          context.callerKind === 'workflow'
            ? ActivitySource.WORKFLOW_EXECUTION
            : ActivitySource.WEB,
        userId: context.userId,
        value: this.activityValue(context, label),
      });
    }
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId,
      label,
      progress: 0,
      room: getUserRoomName(context.roomUserId),
      status: 'processing',
      taskId: context.outputId,
      userId: context.roomUserId,
    });
  }

  private async addCaptionsIfEnabled(
    context: VideoStitchContext,
    s3Key: string,
  ): Promise<string> {
    if (!context.settings.isCaptionsEnabled) {
      return s3Key;
    }
    try {
      const captionContent = await this.whisperService.generateCaptions(
        context.outputId,
      );
      // Same caption row the merge flow has always written; ownership and
      // soft-delete columns pass through the collection's create.
      const captionInput = {
        content: null,
        format: CaptionFormat.SRT,
        ingredientId: context.outputId,
        isDeleted: false,
        language: CaptionLanguage.EN,
        organizationId: context.organizationId,
        userId: context.userId,
      };
      const caption = await this.captionsService.create(captionInput);
      if (caption?.id) {
        await this.captionsService.patch(caption.id, {
          content: captionContent,
        });
      }
      const job = await this.fileQueueService.processVideo({
        ingredientId: context.outputId,
        organizationId: context.organizationId,
        params: { captionContent, s3Key },
        room: getUserRoomName(context.roomUserId),
        type: FILE_JOB_TYPES.ADD_CAPTIONS,
        userId: context.userId,
        websocketUrl: WebSocketPaths.video(context.outputId),
      });
      const result = captionsResult.parse(
        await this.fileQueueService.waitForJob(
          job.jobId,
          CAPTIONS_JOB_TIMEOUT_MS,
        ),
      );
      return result.s3Key;
    } catch (error: unknown) {
      // Captions are best effort: the uncaptioned merge is still delivered.
      this.loggerService.error(
        `${this.logContext} captions failed; delivering uncaptioned output`,
        {
          error: getErrorMessage(error),
          jobId: context.jobId,
          organizationId: context.organizationId,
          outputId: context.outputId,
        },
      );
      return s3Key;
    }
  }

  private async patchMetadata(
    context: VideoStitchContext,
    result: PersistedStitchResult,
    s3Key: string,
  ): Promise<void> {
    const output = await this.requireOutput(
      context.organizationId,
      context.outputId,
    );
    if (!output.metadataId) {
      return;
    }
    await this.prisma.metadata.updateMany({
      data: {
        ...(result.duration !== undefined ? { duration: result.duration } : {}),
        ...(result.height !== undefined ? { height: result.height } : {}),
        result: s3Key,
        ...(result.size !== undefined ? { size: result.size } : {}),
        ...(result.width !== undefined ? { width: result.width } : {}),
      },
      where: {
        id: output.metadataId,
        ingredients: {
          some: scopedWhere(context.organizationId, { id: context.outputId }),
        },
        isDeleted: false,
      },
    });
  }

  private findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<VideoStitchOutputRow | null> {
    return this.prisma.ingredient.findFirst({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: OUTPUT_SELECT,
      where: scopedWhere(organizationId, {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VIDEO,
        ),
        sourceActionId: idempotencyKey,
      }),
    });
  }

  private async requireOutput(
    organizationId: string,
    outputId: string,
  ): Promise<VideoStitchOutputRow> {
    const output = await this.prisma.ingredient.findFirst({
      select: OUTPUT_SELECT,
      where: scopedWhere(organizationId, {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VIDEO,
        ),
        id: outputId,
      }),
    });
    if (!output) {
      throw new Error(`Stitch output ${outputId} is unavailable`);
    }
    return output;
  }

  private contextFromRequest(
    request: VideoStitchRequest,
    outputId: string,
    plan: VideoStitchPlan,
  ): VideoStitchContext {
    return {
      brandId: request.brandId,
      callerKind: request.callerKind,
      clipCount: plan.clipIds.length,
      jobId: videoStitchJobId(outputId),
      organizationId: request.organizationId,
      outputId,
      roomUserId: request.roomUserId ?? request.userId,
      settings: plan.settings,
      userId: request.userId,
    };
  }

  private contextFromOutput(
    output: VideoStitchOutputRow,
    handle: VideoStitchRef,
  ): VideoStitchContext {
    const userId = output.userId ?? '';
    return {
      brandId: output.brandId,
      callerKind: readCallerKind(output.generationSource),
      clipCount: output._count.sources,
      jobId: handle.jobId,
      organizationId: handle.organizationId,
      outputId: output.id,
      roomUserId: handle.roomUserId ?? userId,
      settings: readVideoMergeSettings(output.mergeSettings),
      userId,
    };
  }

  private toHandle(
    organizationId: string,
    output: VideoStitchOutputRow,
    isExisting: boolean,
  ): VideoStitchHandle {
    return {
      isExisting,
      jobId: videoStitchJobId(output.id),
      organizationId,
      outputId: output.id,
      state: toState(output.status),
    };
  }

  private toOutcome(
    jobId: string,
    output: VideoStitchOutputRow,
  ): VideoStitchOutcome {
    const state = toState(output.status);
    return {
      ...(state === 'failed' && output.generationError
        ? { error: output.generationError }
        : {}),
      jobId,
      outputId: output.id,
      ...(state === 'generated' && output.s3Key ? { s3Key: output.s3Key } : {}),
      state,
    };
  }

  private activityId(outputId: string): string {
    return `video-stitch:${outputId}`;
  }

  private activityValue(
    context: VideoStitchContext,
    label: string,
    extra: Record<string, unknown> = {},
  ): string {
    return JSON.stringify({
      callerKind: context.callerKind,
      frameCount: context.clipCount,
      ingredientId: context.outputId,
      label,
      ...extra,
      type: 'merge',
    });
  }
}
