import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientStatus,
} from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

export interface FailedGenerationOptions {
  ingredientId: string;
  websocketUrl: string;
  userId?: string;
  room?: string;
  organizationId?: string;
  activityMetadata?: {
    user: string;
    organization: string;
    key: ActivityKey;
    source: ActivitySource;
    value: string;
  };
  status?: IngredientStatus;
  websocketMethod?: 'emit' | 'publishMediaFailed';
  websocketMessage?: string;
  delay?: number;
}

@Injectable()
export class FailedGenerationService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /**
   * Handle failed generation for any media type
   */
  async handleFailedGeneration<T>(
    service: {
      patch: (id: string, data: Record<string, unknown>) => Promise<T>;
    },
    options: FailedGenerationOptions,
  ): Promise<void> {
    const {
      ingredientId,
      websocketUrl,
      userId,
      room,
      activityMetadata,
      status = IngredientStatus.FAILED,
      websocketMethod = 'emit',
      websocketMessage = 'Generation failed',
      delay = 500,
    } = options;

    // Update the ingredient status
    await service.patch(ingredientId, { status });

    // Update existing activity if metadata provided
    if (activityMetadata) {
      // Parse value to extract ingredientId
      let ingredientId: string | undefined;
      try {
        const parsedValue = JSON.parse(activityMetadata.value);
        ingredientId = parsedValue.ingredientId;
      } catch {
        ingredientId = undefined;
      }

      // Determine processing key based on failed key
      let processingKey: ActivityKey | null = null;
      if (activityMetadata.key === ActivityKey.VIDEO_FAILED) {
        processingKey = ActivityKey.VIDEO_PROCESSING;
      } else if (activityMetadata.key === ActivityKey.IMAGE_FAILED) {
        processingKey = ActivityKey.IMAGE_PROCESSING;
      } else if (activityMetadata.key === ActivityKey.MUSIC_FAILED) {
        processingKey = ActivityKey.MUSIC_PROCESSING;
      }

      // Try to find existing PROCESSING activity
      if (processingKey && ingredientId) {
        const existingActivity = await this.activitiesService.findOne({
          $or: [
            // Try to find by ingredientId in JSON value
            { value: { $regex: ingredientId } },
            // Also check if value is just the ingredientId string
            { value: ingredientId },
          ],
          isDeleted: false,
          key: processingKey,
          user: new Types.ObjectId(activityMetadata.user),
        });

        if (existingActivity) {
          // Update existing activity
          const existingValue = existingActivity.value;
          let parsedValue: Record<string, unknown> = {};

          try {
            parsedValue =
              typeof existingValue === 'string'
                ? JSON.parse(existingValue)
                : existingValue;
          } catch {
            parsedValue = {};
          }

          // Update activity with failure data
          await this.activitiesService.patch(existingActivity._id.toString(), {
            key: activityMetadata.key,
            value: JSON.stringify({
              ...parsedValue,
              error: websocketMessage || 'Generation failed',
              ingredientId: ingredientId,
              label:
                activityMetadata.key === ActivityKey.VIDEO_FAILED
                  ? 'Video Generation'
                  : activityMetadata.key === ActivityKey.IMAGE_FAILED
                    ? 'Image Generation'
                    : 'Music Generation',
              type: parsedValue.type || 'generation',
            }),
          });
        } else {
          // Fallback: create new activity if processing activity not found
          await this.activitiesService.create(
            new ActivityEntity({
              // @ts-expect-error TS2339
              brand: activityMetadata.brand
                ? // @ts-expect-error TS2339
                  new Types.ObjectId(activityMetadata.brand)
                : undefined,
              entityId: new Types.ObjectId(ingredientId),
              entityModel: ActivityEntityModel.INGREDIENT,
              key: activityMetadata.key,
              organization: new Types.ObjectId(activityMetadata.organization),
              source: activityMetadata.source,
              user: new Types.ObjectId(activityMetadata.user),
              value: JSON.stringify({
                error: websocketMessage || 'Generation failed',
                ingredientId: ingredientId,
                label:
                  activityMetadata.key === ActivityKey.VIDEO_FAILED
                    ? 'Video Generation'
                    : activityMetadata.key === ActivityKey.IMAGE_FAILED
                      ? 'Image Generation'
                      : 'Music Generation',
                type: 'generation',
              }),
            }),
          );
        }
      } else {
        // Fallback: create new activity if we can't determine processing key
        await this.activitiesService.create(
          new ActivityEntity({
            // @ts-expect-error TS2339
            brand: activityMetadata.brand
              ? // @ts-expect-error TS2339
                new Types.ObjectId(activityMetadata.brand)
              : undefined,
            key: activityMetadata.key,
            organization: new Types.ObjectId(activityMetadata.organization),
            source: activityMetadata.source,
            user: new Types.ObjectId(activityMetadata.user),
            value: activityMetadata.value,
          }),
        );
      }
    }

    // Send websocket notification
    if (websocketMethod === 'publishMediaFailed') {
      await this.websocketService.publishMediaFailed(
        websocketUrl,
        websocketMessage,
        userId || 'unknown',
        room,
      );
    } else {
      setTimeout(() => {
        void this.websocketService.emit(websocketUrl, {
          result: null,
          status: IngredientStatus.FAILED,
        });
      }, delay);
    }
  }

  /**
   * Handle failed voice generation
   */
  handleFailedVoiceGeneration(
    voicesService: {
      patch: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    ingredientId: string,
    websocketUrl: string,
  ): Promise<void> {
    return this.handleFailedGeneration(voicesService, {
      ingredientId,
      status: IngredientStatus.FAILED,
      websocketMethod: 'emit',
      websocketUrl,
    });
  }

  /**
   * Handle failed avatar generation
   */
  handleFailedAvatarGeneration(
    avatarsService: {
      patch: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    ingredientId: string,
    websocketUrl: string,
  ): Promise<void> {
    return this.handleFailedGeneration(avatarsService, {
      ingredientId,
      status: IngredientStatus.FAILED,
      websocketMethod: 'emit',
      websocketUrl,
    });
  }

  /**
   * Handle failed video generation
   */
  handleFailedVideoGeneration(
    videosService: {
      patch: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    ingredientId: string,
    websocketUrl: string,
    userId: string,
    room?: string,
    activityMetadata?: {
      user: string;
      organization: string;
      brand?: string;
      key: ActivityKey;
      source: ActivitySource;
      value: string;
    },
  ): Promise<void> {
    return this.handleFailedGeneration(videosService, {
      activityMetadata,
      ingredientId,
      room,
      status: IngredientStatus.FAILED,
      userId,
      websocketMessage: 'Processing failed',
      websocketMethod: 'publishMediaFailed',
      websocketUrl,
    });
  }

  /**
   * Handle failed image generation
   */
  handleFailedImageGeneration(
    imagesService: {
      patch: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    ingredientId: string,
    websocketUrl: string,
    metadata?: { user: string; organization: string },
    room?: string,
    errorMessage?: string,
  ): Promise<void> {
    const activityMetadata = metadata
      ? {
          key: ActivityKey.IMAGE_FAILED,
          organization: metadata.organization,
          source: ActivitySource.SCRIPT,
          user: metadata.user,
          value: ingredientId,
        }
      : undefined;

    return this.handleFailedGeneration(imagesService, {
      activityMetadata,
      ingredientId,
      organizationId: metadata?.organization,
      room,
      status: IngredientStatus.FAILED,
      userId: metadata?.user,
      websocketMessage: errorMessage || 'Generation failed',
      websocketMethod: 'publishMediaFailed',
      websocketUrl,
    });
  }

  /**
   * Handle failed music generation
   */
  handleFailedMusicGeneration(
    musicsService: {
      patch: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    ingredientId: string,
    websocketUrl: string,
    userId: string,
    room?: string,
    activityMetadata?: {
      user: string;
      organization: string;
      brand?: string;
      key: ActivityKey;
      source: ActivitySource;
      value: string;
    },
  ): Promise<void> {
    return this.handleFailedGeneration(musicsService, {
      activityMetadata,
      ingredientId,
      room,
      status: IngredientStatus.FAILED,
      userId,
      websocketMessage: 'Generation failed',
      websocketMethod: 'publishMediaFailed',
      websocketUrl,
    });
  }
}
