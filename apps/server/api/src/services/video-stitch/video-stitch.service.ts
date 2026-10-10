import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { scopedWhere } from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type {
  VideoStitchContext,
  VideoStitchFinalFile,
  VideoStitchHandle,
  VideoStitchOutcome,
  VideoStitchOutputRow,
  VideoStitchPlan,
  VideoStitchRef,
  VideoStitchRequest,
} from '@api/services/video-stitch/video-stitch.types';
import {
  buildVideoStitchJobParams,
  captionsResult,
  isMuteDeferredToCaptions,
  isUniqueConstraintViolation,
  type PersistedStitchResult,
  persistedStitchResult,
  readVideoMergeSettings,
  readVideoStitchCallerKind,
  resolveStitchClipStorageKey,
  stitchRequestError,
  toVideoStitchState,
  validateVideoStitchRequest,
  videoStitchActivityValue,
  videoStitchHandle,
  videoStitchOutcome,
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
  IngredientOrigin,
  IngredientStatus,
  JobState,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/contracts';
import {
  VIDEO_STITCH_GENERATION_SOURCE_PREFIX,
  videoStitchGenerationSource,
  videoStitchJobId,
} from '@genfeedai/contracts/interfaces';
import { FILE_JOB_TYPES } from '@genfeedai/contracts/queue';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { assertSafeObjectKey } from '@libs/security';
import { assertStoredObjectKey } from '@libs/security/stored-object-key';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable, Optional } from '@nestjs/common';

const STITCH_JOB_TIMEOUT_MS = 300_000;
/**
 * How long a background tracker follows a queued or running merge job. A
 * transition merge re-encodes every clip, so it can outlast a waiting
 * caller's timeout; past this the output fails instead of staying processing.
 */
const STITCH_TRACKING_TIMEOUT_MS = 20 * 60_000;
const STITCH_TRACKING_POLL_MS = 2_000;
/** `generationStage` a completer claims before captioning and persisting. */
const STITCH_COMPLETION_STAGE = 'stitch-completing';
/** A claim older than this belongs to a completer that died mid-way. */
const STITCH_COMPLETION_CLAIM_TTL_MS = 10 * 60_000;
const CAPTIONS_JOB_TIMEOUT_MS = 180_000;
const OUTPUT_SELECT = {
  _count: { select: { sources: true } },
  brandId: true,
  generationError: true,
  generationSource: true,
  generationStage: true,
  id: true,
  mergeSettings: true,
  metadataId: true,
  s3Key: true,
  status: true,
  userId: true,
} as const;

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
    private readonly assetGateService: AssetGateService,
    private readonly captionsService: CaptionsService,
    private readonly fileQueueService: FileQueueService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly whisperService: WhisperService,
    @Optional() private readonly configService?: ConfigService,
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
      return videoStitchHandle(request.organizationId, existing, true);
    }

    const plan = await this.plan(request);
    let outputId: string;
    try {
      const { ingredientData } =
        await this.sharedService.createMediaDocumentsInternal({
          origin: IngredientOrigin.GENERATED,
          brandId: request.brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          generationSource: videoStitchGenerationSource(request.callerKind),
          mergeSettings: plan.settings,
          order: 1,
          organizationId: request.organizationId,
          ...(request.parentId ? { parentId: request.parentId } : {}),
          ...(request.providerData
            ? { providerData: request.providerData }
            : {}),
          sourceActionId: request.idempotencyKey,
          sourceIds: plan.clipIds,
          status: IngredientStatus.PROCESSING,
          transformations: [TransformationCategory.MERGED],
          userId: request.userId,
          ...(request.workflowExecutionId
            ? { workflowExecutionId: request.workflowExecutionId }
            : {}),
        });
      outputId = String(ingredientData.id);
    } catch (error: unknown) {
      // The partial unique index on active stitch outputs'
      // (organizationId, sourceActionId) is the atomic claim: a concurrent
      // request with the same key lost, so return the winner's output.
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      const winner = await this.findByKey(
        request.organizationId,
        request.idempotencyKey,
      );
      if (!winner) {
        throw error;
      }
      return videoStitchHandle(request.organizationId, winner, true);
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
   * The caller's decision to retry: revalidates the same request, requeues a
   * failed output under the same job id, and re-enqueues a processing output
   * whose job the queue no longer holds.
   */
  async retry(
    request: VideoStitchRequest,
    handle: VideoStitchRef,
  ): Promise<VideoStitchHandle> {
    validateVideoStitchRequest(request);
    const plan = await this.plan(request);
    const reopened = await this.prisma.ingredient.updateMany({
      data: {
        generationError: null,
        generationStage: null,
        status: IngredientStatus.PROCESSING,
      },
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
      const current = {
        ...videoStitchHandle(handle.organizationId, output, true),
        ...(handle.roomUserId ? { roomUserId: handle.roomUserId } : {}),
      };
      if (current.state !== 'processing') {
        return { ...current, jobId: handle.jobId };
      }
      // A processing output must have a job to settle from. When the queue
      // lost it (the API stopped before enqueueing, or the job was evicted),
      // enqueue it again under the output's stitch id, which the files queue
      // deduplicates.
      if (await this.fileQueueService.findJobStatus(handle.jobId)) {
        return { ...current, jobId: handle.jobId };
      }
      const context = this.contextFromRequest(request, handle.outputId, plan);
      await this.enqueue(request, plan, context);
      return { ...current, jobId: context.jobId };
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

  /**
   * Follows the merge job until the output settles. HTTP and webhook callers
   * have no other completer, so tracking never ends with the output still
   * processing: a lost job, a job still unfinished at the deadline, or a job
   * status that stays unreadable until then fails it with the reason.
   */
  trackInBackground(
    handle: VideoStitchRef,
    timeoutMs: number = STITCH_TRACKING_TIMEOUT_MS,
    pollMs: number = STITCH_TRACKING_POLL_MS,
  ): Promise<void> {
    return this.track(handle, timeoutMs, pollMs).catch((error: unknown) => {
      this.loggerService.error(`${this.logContext} tracking failed`, {
        error: getErrorMessage(error),
        jobId: handle.jobId,
        organizationId: handle.organizationId,
        outputId: handle.outputId,
      });
    });
  }

  /** Waits for the merge job; only confirmed job failure fails the output. */
  async waitForCompletion(
    handle: VideoStitchRef,
    timeoutMs: number = STITCH_JOB_TIMEOUT_MS,
  ): Promise<VideoStitchOutcome> {
    const output = await this.requireOutput(
      handle.organizationId,
      handle.outputId,
    );
    if (toVideoStitchState(output.status) !== 'processing') {
      return videoStitchOutcome(handle.jobId, output);
    }
    const context = this.contextFromOutput(output, handle);
    const deadline = Date.now() + timeoutMs;
    let outcome: VideoStitchOutcome;
    try {
      const result = await this.fileQueueService.waitForJob(
        handle.jobId,
        timeoutMs,
      );
      outcome = await this.complete(context, result);
    } catch (error: unknown) {
      const status = await this.fileQueueService.getJobStatus(handle.jobId);
      if (status.state === JobState.FAILED) {
        return this.fail(
          context,
          new Error(status.failedReason || 'Job failed'),
        );
      }
      throw error;
    }
    // Another completer may own captioning. A waiting caller must observe
    // its terminal result; only settle() may return the processing state.
    while (outcome.state === 'processing') {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        // The owner can still finish: a waiting client timing out must not
        // change the shared output to FAILED or release its claim.
        throw new Error('Timed out waiting for video stitch completion');
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250, remaining)),
      );
      outcome = await this.settle(handle);
    }
    return outcome;
  }

  /**
   * Reads the merge job once without waiting and settles the output when the
   * job has finished, or when the queue no longer holds it.
   */
  async settle(handle: VideoStitchRef): Promise<VideoStitchOutcome> {
    const output = await this.requireOutput(
      handle.organizationId,
      handle.outputId,
    );
    if (toVideoStitchState(output.status) !== 'processing') {
      return videoStitchOutcome(handle.jobId, output);
    }
    const context = this.contextFromOutput(output, handle);
    const status = await this.fileQueueService.findJobStatus(handle.jobId);
    if (!status) {
      // A completer that already claimed the output finishes it from the
      // result it read; otherwise nothing can ever settle this output.
      if (output.generationStage === STITCH_COMPLETION_STAGE) {
        return {
          jobId: handle.jobId,
          outputId: output.id,
          state: 'processing',
        };
      }
      return this.fail(
        context,
        new Error('Video merge job is no longer queued; retry the merge'),
      );
    }
    if (status.state === JobState.FAILED) {
      return this.fail(context, new Error(status.failedReason || 'Job failed'));
    }
    if (status.state !== JobState.COMPLETED) {
      return { jobId: handle.jobId, outputId: output.id, state: 'processing' };
    }
    return this.complete(context, status.result);
  }

  private async track(
    handle: VideoStitchRef,
    timeoutMs: number,
    pollMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    try {
      await this.waitForCompletion(
        handle,
        Math.min(STITCH_JOB_TIMEOUT_MS, timeoutMs),
      );
      return;
    } catch (error: unknown) {
      // The wait timed out or lost the queue; keep polling below.
      lastError = error;
    }
    for (;;) {
      try {
        const outcome = await this.settle(handle);
        if (outcome.state !== 'processing') {
          return;
        }
        lastError = undefined;
      } catch (error: unknown) {
        // A transport error or an interrupted completion is retried until
        // the deadline; the output stays processing meanwhile.
        lastError = error;
        this.loggerService.warn(`${this.logContext} tracking read failed`, {
          error: getErrorMessage(error),
          jobId: handle.jobId,
          organizationId: handle.organizationId,
          outputId: handle.outputId,
        });
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        const reason =
          lastError === undefined
            ? `Video merge did not finish within ${Math.ceil(timeoutMs / 60_000)} minutes`
            : `Lost track of the video merge: ${getErrorMessage(lastError)}`;
        await this.failProcessing(handle, reason);
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, remaining)),
      );
    }
  }

  /** Fails the output with `reason` if it is still processing. */
  private async failProcessing(
    handle: VideoStitchRef,
    reason: string,
  ): Promise<void> {
    const output = await this.requireOutput(
      handle.organizationId,
      handle.outputId,
    );
    if (toVideoStitchState(output.status) !== 'processing') {
      return;
    }
    await this.fail(this.contextFromOutput(output, handle), new Error(reason));
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
    let musicStorageKey: string | undefined;
    if (settings.music) {
      // Same scope as the Music API: the organization's own tracks or a
      // global default track.
      const music = await this.prisma.ingredient.findFirst({
        select: { id: true, s3Key: true },
        where: {
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.MUSIC,
          ),
          id: settings.music,
          isDeleted: false,
          OR: [
            { organizationId: request.organizationId },
            { isDefault: true, organizationId: null },
          ],
        },
      });
      if (!music) {
        throw stitchRequestError('music', 'Music asset is not available');
      }
      if (this.configService?.isAuthorizedMediaDeliveryEnabled) {
        if (
          !music.s3Key ||
          !/^ingredients\/(musics|audio|audios)\/.+/.test(music.s3Key)
        ) {
          throw stitchRequestError(
            'music',
            'Music asset has no valid stored media key',
          );
        }
        musicStorageKey = assertStoredObjectKey(music.s3Key, (message) =>
          stitchRequestError('music', message),
        );
      }
    }

    const byId = new Map(clips.map((clip) => [clip.id, clip]));
    return {
      clipIds: request.clipIds,
      ...(musicStorageKey ? { musicStorageKey } : {}),
      ...(request.output ? { output: request.output } : {}),
      settings,
      sourceStorageKeys: request.clipIds.map((id) => {
        const clip = byId.get(id);
        if (!clip) {
          throw stitchRequestError('clipIds', 'Clip is not available');
        }
        return resolveStitchClipStorageKey(
          clip,
          this.configService?.isAuthorizedMediaDeliveryEnabled,
        );
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
      // The job finished and will not report anything else.
      return this.fail(
        context,
        new Error('Video merge did not return a persisted video'),
      );
    }
    const result = parsed.data;
    assertSafeObjectKey(result.s3Key, (message) => new Error(message));

    // Concurrent completers (a background waiter and a polling step) must not
    // both caption and persist the output: the first to claim it does the
    // work, the others report its current state.
    const claimed = await this.prisma.ingredient.updateMany({
      data: { generationStage: STITCH_COMPLETION_STAGE },
      where: scopedWhere(context.organizationId, {
        id: context.outputId,
        OR: [
          { generationStage: null },
          { generationStage: { not: STITCH_COMPLETION_STAGE } },
          {
            updatedAt: {
              lt: new Date(Date.now() - STITCH_COMPLETION_CLAIM_TTL_MS),
            },
          },
        ],
        status: IngredientStatus.PROCESSING,
      }),
    });
    if (claimed.count !== 1) {
      const output = await this.requireOutput(
        context.organizationId,
        context.outputId,
      );
      return videoStitchOutcome(context.jobId, output);
    }

    const finalFile = await this.addCaptionsIfEnabled(context, {
      s3Key: result.s3Key,
      ...(result.size !== undefined ? { size: result.size } : {}),
    });
    const s3Key = finalFile.s3Key;

    await this.patchMetadata(context, result, finalFile);
    const completed = await this.prisma.ingredient.updateMany({
      data: {
        generationError: null,
        generationStage: null,
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
      return videoStitchOutcome(context.jobId, output);
    }

    // Completion bypasses IngredientsService.patch, so unlock the
    // organization's first-asset gate here, before the client hears of it.
    await this.assetGateService.markFirstAssetGenerated(context.organizationId);

    // The output is GENERATED from here on: a failed notification must not
    // report the stitch as failed to its caller.
    try {
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
          value: videoStitchActivityValue(context, label, {
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
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.logContext} completion notification failed`,
        {
          error: getErrorMessage(error),
          jobId: context.jobId,
          organizationId: context.organizationId,
          outputId: context.outputId,
        },
      );
    }
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
      data: {
        generationError: message,
        generationStage: null,
        status: IngredientStatus.FAILED,
      },
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
        value: videoStitchActivityValue(context, 'Merge failed', {
          error: message,
        }),
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
          value: videoStitchActivityValue(context, label),
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
        value: videoStitchActivityValue(context, label),
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
    merged: VideoStitchFinalFile,
  ): Promise<VideoStitchFinalFile> {
    if (!context.settings.isCaptionsEnabled) {
      return merged;
    }
    const { s3Key } = merged;
    const isMuteDeferred = isMuteDeferredToCaptions(context.settings);
    try {
      const captionContent = await this.whisperService.generateCaptions(
        context.outputId,
        undefined,
        context.organizationId,
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
      return await this.runCaptionsJob(context, s3Key, captionContent);
    } catch (error: unknown) {
      // Captions are best effort: the uncaptioned merge is still delivered,
      // muted when the request asked for it.
      this.loggerService.error(
        `${this.logContext} captions failed; delivering uncaptioned output`,
        {
          error: getErrorMessage(error),
          jobId: context.jobId,
          organizationId: context.organizationId,
          outputId: context.outputId,
        },
      );
      return isMuteDeferred ? this.runCaptionsJob(context, s3Key, '') : merged;
    }
  }

  /** Burns captions (and applies a deferred mute) onto the merged output. */
  private async runCaptionsJob(
    context: VideoStitchContext,
    s3Key: string,
    captionContent: string,
  ): Promise<VideoStitchFinalFile> {
    const job = await this.fileQueueService.processVideo({
      ingredientId: context.outputId,
      organizationId: context.organizationId,
      params: {
        captionContent,
        ...(isMuteDeferredToCaptions(context.settings)
          ? { isMuteVideoAudio: true }
          : {}),
        s3Key,
      },
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
    // The captioned copy replaced the merge, so its size is the output's.
    return {
      s3Key: result.s3Key,
      ...(result.size !== undefined ? { size: result.size } : {}),
    };
  }

  private async patchMetadata(
    context: VideoStitchContext,
    result: PersistedStitchResult,
    finalFile: VideoStitchFinalFile,
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
        result: finalFile.s3Key,
        ...(finalFile.size !== undefined ? { size: finalFile.size } : {}),
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
        // Same scope as the unique index: only stitch outputs own a key.
        generationSource: { startsWith: VIDEO_STITCH_GENERATION_SOURCE_PREFIX },
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
      callerKind: readVideoStitchCallerKind(output.generationSource),
      clipCount: output._count.sources,
      jobId: handle.jobId,
      organizationId: handle.organizationId,
      outputId: output.id,
      roomUserId: handle.roomUserId ?? userId,
      settings: readVideoMergeSettings(output.mergeSettings),
      userId,
    };
  }

  private activityId(outputId: string): string {
    return `video-stitch:${outputId}`;
  }
}
