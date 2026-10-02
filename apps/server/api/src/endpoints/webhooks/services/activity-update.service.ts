import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import {
  getActivityLabel,
  getActivityResultType,
} from '@api/helpers/utils/activity-label/activity-label.util';
import {
  ActivityRoutingInput,
  getActivityRouting,
  getFailureActivityRouting,
} from '@api/helpers/utils/activity-routing/activity-routing.util';
import {
  buildCompletionValue,
  buildFailureValue,
  parseActivityValue,
} from '@api/helpers/utils/activity-value/activity-value.util';
import { resolveRoom } from '@api/helpers/utils/websocket-room/websocket-room.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  IngredientCategory,
  MetadataExtension,
} from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivityUpdateService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /**
   * Updates or creates an activity for a successful generation.
   * Consolidates the repeated activity-update pattern from processMediaFromWebhook.
   */
  async updateSuccessActivity(params: {
    dbUserId: string;
    ingredientId: string;
    category: IngredientCategory | string;
    metadataExtension?: MetadataExtension | string;
    transformations?: string[];
    userId?: string;
    userRoom?: string;
    brandId?: string;
    organizationId?: string;
  }): Promise<void> {
    const {
      dbUserId,
      ingredientId,
      category,
      metadataExtension,
      transformations = [],
      userId,
      userRoom,
      brandId,
      organizationId,
    } = params;

    const isReframe = transformations.includes('reframed');
    const isUpscale = transformations.includes('upscaled');

    const routingInput: ActivityRoutingInput = {
      category,
      isReframe,
      isUpscale,
      metadataExtension,
    };

    const routing = getActivityRouting(routingInput);
    if (!routing) {
      return;
    }

    const { activityKey, processingKey, activitySource } = routing;

    const existingActivity = await this.findLifecycleActivity(
      ingredientId,
      processingKey,
      dbUserId,
      activityKey,
      organizationId,
    );

    let activity: ActivityDocument;
    if (existingActivity) {
      const parsedValue = parseActivityValue(
        existingActivity.value ?? undefined,
      );

      activity =
        (await this.activityRecorder.update(existingActivity, {
          entityId: ingredientId,
          entityModel: ActivityEntityModel.INGREDIENT,
          isRead: false,
          key: activityKey,
          value: buildCompletionValue({
            activityKey,
            existingValue: {
              ...parsedValue,
              startedAt:
                parsedValue.startedAt ??
                existingActivity.createdAt?.toISOString(),
              completedAt:
                existingActivity.key === activityKey
                  ? (parsedValue.completedAt ?? new Date().toISOString())
                  : new Date().toISOString(),
            },
            ingredientId,
          }),
        })) ?? existingActivity;
    } else {
      activity = await this.activityRecorder.record({
        brandId: brandId ? String(brandId) : null,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: activityKey,
        organizationId: organizationId ? String(organizationId) : null,
        source: activitySource,
        userId: dbUserId,
        value: buildCompletionValue({
          activityKey,
          ingredientId,
          existingValue: { completedAt: new Date().toISOString() },
        }),
      });
    }

    if (userId) {
      const resultType = getActivityResultType(activityKey);
      const room = resolveRoom(userRoom, userId);

      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity.id.toString(),
        label: getActivityLabel(activityKey),
        progress: 100,
        resultId: ingredientId,
        // @ts-expect-error TS2322
        resultType,
        room: room || getUserRoomName(userId),
        status: 'completed',
        taskId: ingredientId,
        userId,
      });
    }
  }

  /**
   * Updates or creates an activity for a failed generation.
   * Consolidates the repeated failure-activity pattern from handleFailedGeneration.
   */
  async updateFailureActivity(params: {
    dbUserId: string;
    ingredientId: string;
    category: IngredientCategory | string;
    errorMessage?: string;
    userId?: string;
    userRoom?: string;
    brandId?: string;
    organizationId?: string;
  }): Promise<void> {
    const {
      dbUserId,
      ingredientId,
      category,
      errorMessage,
      userId,
      userRoom,
      brandId,
      organizationId,
    } = params;

    const routing = getFailureActivityRouting(category);
    if (!routing) {
      return;
    }

    const { activityKey, processingKey, activitySource } = routing;

    const existingActivity = await this.findLifecycleActivity(
      ingredientId,
      processingKey,
      dbUserId,
      activityKey,
      organizationId,
    );

    let activity: ActivityDocument;
    if (existingActivity) {
      const parsedValue = parseActivityValue(
        existingActivity.value ?? undefined,
      );

      activity =
        (await this.activityRecorder.update(existingActivity, {
          entityId: ingredientId,
          entityModel: ActivityEntityModel.INGREDIENT,
          isRead: false,
          key: activityKey,
          value: buildFailureValue({
            activityKey,
            errorMessage,
            existingValue: {
              ...parsedValue,
              startedAt:
                parsedValue.startedAt ??
                existingActivity.createdAt?.toISOString(),
              completedAt:
                existingActivity.key === activityKey
                  ? (parsedValue.completedAt ?? new Date().toISOString())
                  : new Date().toISOString(),
            },
            ingredientId,
          }),
        })) ?? existingActivity;
    } else {
      activity = await this.activityRecorder.record({
        brandId: brandId ? String(brandId) : null,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: activityKey,
        organizationId: organizationId ? String(organizationId) : null,
        source: activitySource,
        userId: dbUserId,
        value: buildFailureValue({
          activityKey,
          errorMessage,
          ingredientId,
          existingValue: { completedAt: new Date().toISOString() },
        }),
      });
    }

    if (userId && activity) {
      const room = resolveRoom(userRoom, userId);

      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity.id.toString(),
        error: errorMessage || 'Generation failed',
        label: getActivityLabel(activityKey),
        room: room || getUserRoomName(userId),
        status: 'failed',
        taskId: ingredientId,
        userId,
      });
    }
  }

  /**
   * Reuses the same lifecycle row, including a repeated terminal callback.
   */
  private findLifecycleActivity(
    ingredientId: string,
    processingKey: ActivityKey,
    dbUserId: string,
    terminalKey: ActivityKey,
    organizationId?: string,
  ): Promise<ActivityDocument | null> {
    return this.activitiesService.findGenerationActivity(
      [processingKey, terminalKey],
      ingredientId,
      dbUserId,
      organizationId,
    );
  }
}
