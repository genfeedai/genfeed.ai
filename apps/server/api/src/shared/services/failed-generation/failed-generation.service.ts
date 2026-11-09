import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { settleIngredientGeneration } from '@api/collections/ingredients/utils/ingredient-status-transition.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientStatus,
} from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface FailedGenerationOptions {
  ingredientId: string;
  websocketUrl: string;
  userId?: string;
  room?: string;
  organizationId?: string;
  activityMetadata?: {
    brandId?: string;
    organizationId: string;
    userId: string;
    key: ActivityKey;
    source: ActivitySource;
    value: string;
  };
  websocketMethod?: 'emit' | 'publishMediaFailed';
  websocketMessage?: string;
  delay?: number;
}

@Traced()
@Injectable()
export class FailedGenerationService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /**
   * Fails a generation that is still in flight and announces it (#9735). A
   * generation the user cancelled, or one that already finished, is left as
   * it is and announced no further.
   */
  async handleFailedGeneration(
    ingredients: Pick<IngredientsService, 'patchAll'>,
    options: FailedGenerationOptions,
  ): Promise<void> {
    const isSettled = await settleIngredientGeneration(ingredients, {
      data: {
        generationError: options.websocketMessage ?? 'Generation failed',
      },
      id: options.ingredientId,
      organizationId:
        options.organizationId ?? options.activityMetadata?.organizationId,
      to: IngredientStatus.FAILED,
    });
    if (!isSettled) return;
    await this.notifyFailedGeneration(options);
  }

  /** Publish failure side effects after the caller has claimed terminal status. */
  async notifyFailedGeneration(
    options: FailedGenerationOptions,
  ): Promise<void> {
    const {
      websocketUrl,
      userId,
      room,
      activityMetadata,
      websocketMethod = 'emit',
      websocketMessage = 'Generation failed',
      delay = 500,
    } = options;

    // Update existing activity if metadata provided
    if (activityMetadata) {
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
        const existingActivity = await this.activitiesService.findByActionValue(
          processingKey,
          ingredientId,
          activityMetadata.userId,
          activityMetadata.organizationId,
        );

        if (existingActivity) {
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

          await this.activityRecorder.update(existingActivity, {
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
          await this.activityRecorder.record({
            brandId: activityMetadata.brandId,
            entityId: ingredientId,
            entityModel: ActivityEntityModel.INGREDIENT,
            key: activityMetadata.key,
            organizationId: activityMetadata.organizationId,
            source: activityMetadata.source,
            userId: activityMetadata.userId,
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
          });
        }
      } else {
        // Fallback: create new activity if we can't determine processing key
        await this.activityRecorder.record({
          brandId: activityMetadata.brandId,
          key: activityMetadata.key,
          organizationId: activityMetadata.organizationId,
          source: activityMetadata.source,
          userId: activityMetadata.userId,
          value: activityMetadata.value,
        });
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
   * Handle failed video generation
   */
  handleFailedVideoGeneration(
    videosService: Pick<IngredientsService, 'patchAll'>,
    ingredientId: string,
    organizationId: string,
    websocketUrl: string,
    userId: string,
    room?: string,
    activityMetadata?: {
      brandId?: string;
      organizationId: string;
      userId: string;
      key: ActivityKey;
      source: ActivitySource;
      value: string;
    },
  ): Promise<void> {
    return this.handleFailedGeneration(videosService, {
      activityMetadata,
      ingredientId,
      organizationId,
      room,
      userId,
      websocketMessage: 'Processing failed',
      websocketMethod: 'publishMediaFailed',
      websocketUrl,
    });
  }

  /**
   * Handle failed image generation
   */
  async handleFailedImageGeneration(
    imagesService: Pick<IngredientsService, 'patchAll'>,
    ingredientId: string,
    websocketUrl: string,
    metadata?: { userId: string; organizationId: string },
    room?: string,
    errorMessage?: string,
  ): Promise<void> {
    const isSettled = await settleIngredientGeneration(imagesService, {
      data: { generationError: errorMessage ?? 'Generation failed' },
      id: ingredientId,
      organizationId: metadata?.organizationId,
      to: IngredientStatus.FAILED,
    });
    if (!isSettled) return;
    await this.notifyFailedImageGeneration(
      ingredientId,
      websocketUrl,
      metadata,
      room,
      errorMessage,
    );
  }

  async notifyFailedImageGeneration(
    ingredientId: string,
    websocketUrl: string,
    metadata?: { userId: string; organizationId: string },
    room?: string,
    errorMessage?: string,
  ): Promise<void> {
    const activityMetadata = metadata
      ? {
          key: ActivityKey.IMAGE_FAILED,
          organizationId: metadata.organizationId,
          source: ActivitySource.SCRIPT,
          userId: metadata.userId,
          value: JSON.stringify({
            error: errorMessage || 'Generation failed',
            ingredientId,
          }),
        }
      : undefined;

    return this.notifyFailedGeneration({
      activityMetadata,
      ingredientId,
      organizationId: metadata?.organizationId,
      room,
      userId: metadata?.userId,
      websocketMessage: errorMessage || 'Generation failed',
      websocketMethod: 'publishMediaFailed',
      websocketUrl,
    });
  }

  /**
   * Handle failed music generation. `errorMessage` is the provider's reason,
   * stored on the ingredient and pushed to the client so the tile can show it.
   */
  handleFailedMusicGeneration(
    musicsService: Pick<IngredientsService, 'patchAll'>,
    ingredientId: string,
    websocketUrl: string,
    userId: string,
    room?: string,
    activityMetadata?: {
      brandId?: string;
      organizationId: string;
      userId: string;
      key: ActivityKey;
      source: ActivitySource;
      value: string;
    },
    errorMessage?: string,
  ): Promise<void> {
    return this.handleFailedGeneration(musicsService, {
      activityMetadata,
      ingredientId,
      room,
      userId,
      websocketMessage: errorMessage?.trim() || 'Generation failed',
      websocketMethod: 'publishMediaFailed',
      websocketUrl,
    });
  }
}
