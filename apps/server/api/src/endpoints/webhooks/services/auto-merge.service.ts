import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import {
  type IngredientDocument,
  type IngredientRefDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { UserExtractionUtil } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { resolveRoom } from '@api/helpers/utils/websocket-room/websocket-room.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { JOB_TYPES } from '@files/queues/queue.constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AutoMergeService {
  private readonly logContext = 'AutoMergeService';

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly usersService: UsersService,
    private readonly filesClientService: FilesClientService,
    private readonly fileQueueService: FileQueueService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly loggerService: LoggerService,
  ) {}

  private getDocumentId(
    value:
      | {
          _id?: string | { toString(): string };
          id?: string | { toString(): string };
        }
      | null
      | undefined,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value._id === 'string') {
      return value._id;
    }

    if (value._id && typeof value._id.toString === 'function') {
      return value._id.toString();
    }

    if (typeof value.id === 'string') {
      return value.id;
    }

    if (value.id && typeof value.id.toString === 'function') {
      return value.id.toString();
    }

    return undefined;
  }

  private getRefId(
    ref: string | IngredientRefDocument | null | undefined,
  ): string | undefined {
    if (typeof ref === 'string') {
      return ref;
    }

    return ref?._id?.toString() ?? ref?.id?.toString();
  }

  private toUserReference(
    ref: string | IngredientRefDocument | null | undefined,
  ): string | { _id?: string; clerkId?: string } | undefined {
    if (typeof ref === 'string') {
      return ref;
    }

    if (!ref) {
      return undefined;
    }

    const userId = this.getRefId(ref);
    const clerkId = typeof ref.clerkId === 'string' ? ref.clerkId : undefined;

    if (!userId && !clerkId) {
      return undefined;
    }

    return {
      ...(userId ? { _id: userId } : {}),
      ...(clerkId ? { clerkId } : {}),
    };
  }

  /**
   * Trigger auto-merge if this video is part of a batch with merge enabled.
   * Runs in background to not block webhook response.
   */
  triggerAutoMergeIfReady(ingredient: IngredientDocument): void {
    setImmediate(() => {
      this.triggerAutoMergeAsync(ingredient).catch((error: unknown) => {
        this.loggerService.error(`${this.logContext} auto-merge check failed`, {
          error: getErrorMessage(error),
          groupId: ingredient.groupId,
          ingredientId: ingredient._id,
        });
      });
    });
  }

  private async triggerAutoMergeAsync(
    ingredient: IngredientDocument,
  ): Promise<void> {
    if (String(ingredient.category) !== IngredientCategory.VIDEO) {
      return;
    }

    const groupId = ingredient.groupId;
    const isMergeEnabled = ingredient.isMergeEnabled;

    if (!groupId || !isMergeEnabled) {
      this.loggerService.debug(
        `${this.logContext} not part of merge-enabled group`,
        { groupId, ingredientId: ingredient._id, isMergeEnabled },
      );
      return;
    }

    this.loggerService.log(`${this.logContext} checking group completion`, {
      groupId,
      ingredientId: ingredient._id,
    });

    const groupVideos = await this.findGroupVideos(groupId);
    if (!groupVideos || groupVideos.length === 0) {
      this.loggerService.warn(`${this.logContext} no videos found for group`, {
        groupId,
      });
      return;
    }

    if (!this.areAllVideosComplete(groupVideos)) {
      const completedCount = this.countCompleted(groupVideos);
      this.loggerService.debug(
        `${this.logContext} waiting for all videos to complete`,
        { completedCount, groupId, totalCount: groupVideos.length },
      );
      return;
    }

    if (await this.mergeAlreadyExists(groupId)) {
      return;
    }

    const videoIds = groupVideos.map((v) => v._id.toString());

    this.loggerService.log(`${this.logContext} triggering auto-merge`, {
      groupId,
      videoCount: videoIds.length,
      videoIds,
    });

    const userInfo = await this.resolveUserInfo(ingredient);
    if (!userInfo.userId) {
      this.loggerService.warn(
        `${this.logContext} no userId available for merge`,
        { groupId },
      );
      return;
    }

    await this.createAndQueueMerge(ingredient, groupId, videoIds, userInfo);
  }

  private async findGroupVideos(
    groupId: string,
  ): Promise<IngredientDocument[]> {
    const groupAggregate = [
      {
        $match: {
          category: IngredientCategory.VIDEO,
          groupId,
          isDeleted: false,
        },
      },
      { $sort: { groupIndex: 1 as const } },
    ];

    const result = await this.ingredientsService.findAll(groupAggregate, {
      pagination: false,
    });
    return result.docs || [];
  }

  private areAllVideosComplete(groupVideos: IngredientDocument[]): boolean {
    const completedStatuses = [
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
    ];
    return groupVideos.every((v) =>
      completedStatuses.includes(v.status as IngredientStatus),
    );
  }

  private countCompleted(groupVideos: IngredientDocument[]): number {
    const completedStatuses = [
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
    ];
    return groupVideos.filter((v) =>
      completedStatuses.includes(v.status as IngredientStatus),
    ).length;
  }

  private async mergeAlreadyExists(groupId: string): Promise<boolean> {
    const existingMerge = await this.ingredientsService.findOne({
      category: IngredientCategory.VIDEO,
      groupId,
      isDeleted: false,
      transformations: { $in: [TransformationCategory.MERGED] },
    });

    if (existingMerge) {
      this.loggerService.debug(
        `${this.logContext} merge already exists for group`,
        { existingMergeId: existingMerge._id, groupId },
      );
      return true;
    }
    return false;
  }

  private async resolveUserInfo(ingredient: IngredientDocument): Promise<{
    dbUserId?: string;
    clerkUserId?: string;
    userId?: string;
    userRoom?: string;
  }> {
    let { dbUserId, clerkUserId, userId, userRoom } =
      UserExtractionUtil.extractUserIds(this.toUserReference(ingredient.user));

    if (!clerkUserId && dbUserId) {
      try {
        const fullUser = await this.usersService.findOne({
          _id: dbUserId,
        });
        if (fullUser?.clerkId) {
          clerkUserId = fullUser.clerkId;
          userId = clerkUserId;
          userRoom = getUserRoomName(clerkUserId);
        }
      } catch {
        // Continue without clerkId
      }
    }

    return { clerkUserId, dbUserId, userId, userRoom };
  }

  private async createAndQueueMerge(
    ingredient: IngredientDocument,
    groupId: string,
    videoIds: string[],
    userInfo: {
      dbUserId?: string;
      clerkUserId?: string;
      userId?: string;
      userRoom?: string;
    },
  ): Promise<void> {
    const { dbUserId, clerkUserId, userId, userRoom } = userInfo;
    const resolvedUserId = userId ?? dbUserId;
    if (!resolvedUserId) {
      throw new Error('No userId available for auto-merge');
    }

    const organizationId = this.getRefId(ingredient.organization);
    if (!organizationId) {
      throw new Error('No organizationId available for auto-merge');
    }

    const parentIds = videoIds;

    const metadataData = await this.metadataService.create(
      new MetadataEntity({
        extension: MetadataExtension.MP4,
      }) as unknown as Parameters<MetadataService['create']>[0],
    );
    const metadataId = this.getDocumentId(
      metadataData as { _id?: string; id?: string } | null,
    );
    if (!metadataId) {
      throw new Error('Auto-merge metadata id is missing');
    }

    const ingredientData = await this.ingredientsService.create({
      brand: this.getRefId(ingredient.brand),
      category: IngredientCategory.VIDEO,
      groupId,
      metadata: metadataId,
      order: 1,
      organization: organizationId,
      sources: parentIds,
      status: IngredientStatus.PROCESSING,
      transformations: [TransformationCategory.MERGED],
      user: dbUserId,
    } as unknown as Parameters<typeof this.ingredientsService.create>[0]);

    const mergedIngredientId = String(ingredientData._id);
    const websocketURL = WebSocketPaths.video(mergedIngredientId);
    const room =
      resolveRoom(userRoom, resolvedUserId) || getUserRoomName(resolvedUserId);

    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: this.getRefId(ingredient.brand),
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organization: organizationId,
        source: ActivitySource.WEB,
        user: dbUserId,
        value: JSON.stringify({
          frameCount: videoIds.length,
          groupId,
          ingredientId: mergedIngredientId,
          label: `Auto-merging ${videoIds.length} videos`,
          type: 'auto-merge',
        }),
      }),
    );
    const activityId = activity._id.toString();

    if (userId) {
      await this.websocketService.publishBackgroundTaskUpdate({
        activityId,
        label: `Merging ${videoIds.length} interpolation videos`,
        progress: 0,
        room,
        status: 'processing',
        taskId: mergedIngredientId,
        userId: resolvedUserId,
      });
    }

    this.fileQueueService
      .processVideo({
        clerkUserId: clerkUserId || '',
        ingredientId: mergedIngredientId,
        organizationId,
        params: {
          sourceIds: videoIds,
          transition: undefined,
          transitionDuration: undefined,
        },
        room,
        type: JOB_TYPES.MERGE_VIDEOS,
        userId: dbUserId || '',
        websocketUrl: websocketURL,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(
          job.jobId,
          300_000,
        );

        const output =
          typeof result.outputPath === 'string' ? result.outputPath : undefined;
        if (!output) {
          throw new Error('Auto-merge job returned no output path');
        }
        const ingredientId = String(ingredientData._id);

        const meta = await this.filesClientService.uploadToS3(
          ingredientId,
          'videos',
          { path: output, type: FileInputType.FILE },
        );

        await this.metadataService.patch(metadataId, {
          duration: meta.duration,
          height: meta.height,
          size: meta.size,
          width: meta.width,
        });

        await this.ingredientsService.patch(ingredientId, {
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.MERGED],
        });

        await this.websocketService.publishVideoComplete(
          websocketURL,
          {
            eventType: WebSocketEventType.VIDEO_MERGED,
            id: ingredientId,
            status: 'completed',
            transformation: TransformationCategory.MERGED,
          },
          resolvedUserId,
          room,
        );

        await this.activitiesService.patch(activityId, {
          key: ActivityKey.VIDEO_COMPLETED,
          value: JSON.stringify({
            frameCount: videoIds.length,
            groupId,
            ingredientId: mergedIngredientId,
            label: `Merged ${videoIds.length} videos`,
            progress: 100,
            resultId: mergedIngredientId,
            resultType: 'VIDEO',
            type: 'auto-merge',
          }),
        });

        await this.websocketService.publishBackgroundTaskUpdate({
          activityId,
          label: `Merged ${videoIds.length} videos`,
          progress: 100,
          resultId: mergedIngredientId,
          resultType: 'VIDEO',
          room,
          status: 'completed',
          taskId: mergedIngredientId,
          userId: resolvedUserId,
        });

        this.loggerService.log(`${this.logContext} auto-merge completed`, {
          groupId,
          mergedIngredientId,
          videoCount: videoIds.length,
        });
      })
      .catch(async (error: unknown) => {
        const errorMessage = getErrorMessage(error);

        this.loggerService.error(`${this.logContext} auto-merge failed`, {
          error: errorMessage,
          groupId,
          mergedIngredientId,
        });

        await this.ingredientsService.patch(mergedIngredientId, {
          status: IngredientStatus.FAILED,
        });

        await this.websocketService.publishMediaFailed(
          websocketURL,
          `Auto-merge failed: ${errorMessage}`,
          userId!,
          room,
        );

        await this.activitiesService.patch(activityId, {
          key: ActivityKey.VIDEO_FAILED,
          value: JSON.stringify({
            error: errorMessage,
            frameCount: videoIds.length,
            groupId,
            ingredientId: mergedIngredientId,
            label: 'Auto-merge failed',
            type: 'auto-merge',
          }),
        });

        await this.websocketService.publishBackgroundTaskUpdate({
          activityId,
          error: errorMessage,
          label: 'Auto-merge failed',
          room,
          status: 'failed',
          taskId: mergedIngredientId,
          userId: userId!,
        });
      });
  }
}
