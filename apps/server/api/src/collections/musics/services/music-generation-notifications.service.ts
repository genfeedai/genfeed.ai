import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

/**
 * Groups the activity/websocket/failure side effects `MusicGenerationService`
 * needs around each output's lifecycle. Extracted purely to keep that
 * service's own constructor under the runtime-complexity ratchet's
 * constructor-dependency limit — `activitiesService`, `failedGenerationService`,
 * `musicsService`, and `websocketService` were four separate injections there
 * for logic that only ever runs together.
 */
@Injectable()
export class MusicGenerationNotificationsService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly musicsService: MusicsService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /** First output of a generation: creates the processing activity and publishes it. */
  async notifyGenerationStarted(params: {
    brandId: string;
    ingredientId: string;
    model: string;
    user: User;
  }): Promise<void> {
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: params.brandId,
        entityId: params.ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MUSIC_PROCESSING,
        organizationId: params.user.organizationId,
        source: ActivitySource.MUSIC_GENERATION,
        userId: params.user.userId ?? params.user.id,
        value: JSON.stringify({
          ingredientId: params.ingredientId,
          model: params.model,
          type: 'generation',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Music Generation',
      progress: 0,
      room: getUserRoomName(params.user.id),
      status: 'processing',
      taskId: params.ingredientId,
      userId: params.user.id,
    });
  }

  /**
   * Output 2+ of a generation: creates its own processing activity,
   * publishes it, and stamps the shared prompt id onto the new ingredient.
   */
  async notifyAdditionalOutputStarted(params: {
    brandId: string;
    ingredientId: string;
    promptId: string;
    user: User;
  }): Promise<void> {
    const activity = await this.activitiesService.create({
      brandId: params.brandId,
      entityId: params.ingredientId,
      entityModel: ActivityEntityModel.INGREDIENT,
      key: ActivityKey.MUSIC_PROCESSING,
      organizationId: params.user.organizationId,
      source: ActivitySource.MUSIC_GENERATION,
      userId: params.user.userId ?? params.user.id,
      value: JSON.stringify({
        ingredientId: params.ingredientId,
        type: 'generation',
      }),
    });

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: String(activity.id),
      label: 'Music generation',
      resultId: params.ingredientId,
      status: 'processing',
      taskId: params.ingredientId,
      userId: params.user.userId ?? params.user.id,
    });

    await this.musicsService.patch(params.ingredientId, {
      promptId: params.promptId,
    });
  }

  handleFailedGeneration(
    user: User,
    brandId: string,
    ingredientId: string,
    websocketPath: string,
    error: string,
  ): Promise<void> {
    return this.failedGenerationService.handleFailedMusicGeneration(
      this.musicsService,
      ingredientId.toString(),
      websocketPath,
      user.id,
      getUserRoomName(user.id),
      {
        brandId,
        key: ActivityKey.MUSIC_FAILED,
        organizationId: user.organizationId,
        source: ActivitySource.MUSIC_GENERATION,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          error,
          ingredientId: ingredientId.toString(),
        }),
      },
    );
  }
}
