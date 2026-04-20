import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
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
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  IngredientCategory,
  MetadataExtension,
} from '@genfeedai/enums';
import { type Activity } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivityUpdateService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly websocketService: NotificationsPublisherService,
    readonly _loggerService: LoggerService,
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

    const existingActivity = await this.findProcessingActivity(
      ingredientId,
      processingKey,
      dbUserId,
    );

    let activity;
    if (existingActivity) {
      const parsedValue = parseActivityValue(existingActivity.value);

      activity = await this.activitiesService.patch(
        existingActivity._id.toString(),
        {
          key: activityKey,
          value: buildCompletionValue({
            activityKey,
            existingValue: parsedValue,
            ingredientId,
          }),
        },
      );
    } else {
      activity = await this.activitiesService.create(
        new ActivityEntity({
          brand: brandId ? String(brandId) : undefined,
          entityId: ingredientId,
          entityModel: ActivityEntityModel.INGREDIENT,
          key: activityKey,
          organization: organizationId ? String(organizationId) : undefined,
          source: activitySource,
          user: dbUserId,
          value: buildCompletionValue({ activityKey, ingredientId }),
        }),
      );
    }

    if (userId) {
      const resultType = getActivityResultType(activityKey);
      const room = resolveRoom(userRoom, userId);

      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity._id.toString(),
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

    const existingActivity = await this.findProcessingActivity(
      ingredientId,
      processingKey,
      dbUserId,
    );

    let activity;
    if (existingActivity) {
      const parsedValue = parseActivityValue(existingActivity.value);

      activity = await this.activitiesService.patch(
        existingActivity._id.toString(),
        {
          key: activityKey,
          value: buildFailureValue({
            activityKey,
            errorMessage,
            existingValue: parsedValue,
            ingredientId,
          }),
        },
      );
    } else {
      activity = await this.activitiesService.create(
        new ActivityEntity({
          brand: brandId ? String(brandId) : undefined,
          entityId: ingredientId,
          entityModel: ActivityEntityModel.INGREDIENT,
          key: activityKey,
          organization: organizationId ? String(organizationId) : undefined,
          source: activitySource,
          user: dbUserId,
          value: buildFailureValue({ activityKey, errorMessage, ingredientId }),
        }),
      );
    }

    if (userId && activity) {
      const room = resolveRoom(userRoom, userId);

      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity._id.toString(),
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
   * Finds an existing PROCESSING activity by ingredientId in the value field.
   */
  private findProcessingActivity(
    ingredientId: string,
    processingKey: ActivityKey,
    dbUserId: string,
  ): Promise<Activity | null> {
    return this.activitiesService.findOne({
      $or: [{ value: { $regex: ingredientId } }, { value: ingredientId }],
      isDeleted: false,
      key: processingKey,
      user: dbUserId,
    });
  }
}
