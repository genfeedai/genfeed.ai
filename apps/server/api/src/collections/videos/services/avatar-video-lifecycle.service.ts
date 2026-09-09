import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

interface AvatarProcessingAnnouncement {
  brandId: string;
  ingredientId: string;
  organizationId: string;
  userId: string;
}

/**
 * Owns the durable activity record and the socket signals for one avatar
 * generation. Keeping it out of the generation service leaves that service with
 * the provider work and one collaborator instead of two lifecycle clients.
 */
@Injectable()
export class AvatarVideoLifecycleService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async announceProcessing(input: AvatarProcessingAnnouncement): Promise<void> {
    const activity = await this.activitiesService.create({
      brandId: input.brandId,
      entityId: input.ingredientId,
      entityModel: ActivityEntityModel.INGREDIENT,
      organizationId: input.organizationId,
      userId: input.userId,
      key: ActivityKey.VIDEO_PROCESSING,
      source: ActivitySource.AVATAR_GENERATION,
      value: JSON.stringify({
        ingredientId: input.ingredientId,
        resultType: 'AVATAR',
      }),
    });
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: String(activity.id),
      taskId: input.ingredientId,
      resultId: input.ingredientId,
      status: 'processing',
      label: 'Avatar generation',
      userId: input.userId,
    });
  }

  async publishInitialStatus(
    ingredientId: string,
    userId: string,
  ): Promise<void> {
    await this.websocketService.publishVideoProgress(
      WebSocketPaths.video(ingredientId),
      0,
      userId,
      getUserRoomName(userId),
    );
  }
}
