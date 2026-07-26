import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type {
  CreateVideoPlaceholderActivityParams,
  VideoGenerationContext,
  VideoGenerationSaveDocumentsResult,
} from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class VideoGenerationExecutionService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly providerDispatchService: VideoGenerationProviderDispatchService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async execute(context: VideoGenerationContext): Promise<void> {
    await this.createPlaceholderActivity({
      authProviderUserId: context.user.id,
      brandId: context.brand.id,
      ingredientId: context.ingredientData.id,
      model: context.model,
      organization: context.publicMetadata.organization,
      user: context.publicMetadata.user,
    });
    const outputs = context.createVideoDto.outputs || 1;
    this.loggerService.debug('Video generation request received', {
      model: context.model,
      outputs,
      rawOutputs: context.createVideoDto.outputs,
    });

    try {
      const generationId = await this.dispatch(context);
      if (!generationId) {
        throw this.generationStartError();
      }

      const isBatchSupported =
        MODEL_OUTPUT_CAPABILITIES[context.model]?.isBatchSupported ?? false;
      if (isBatchSupported && outputs > 1) {
        await this.createBatchOutputs(context, generationId, outputs);
      } else if (outputs > 1) {
        await this.createSequentialOutputs(context, generationId, outputs);
      } else {
        await this.metadataService.patch(
          context.metadataData.id,
          new MetadataEntity({ externalId: generationId }),
        );
      }
    } catch (error: unknown) {
      await this.failPendingOutputs(context, error);
      throw error;
    }
  }

  private async createBatchOutputs(
    context: VideoGenerationContext,
    generationId: string,
    outputs: number,
  ): Promise<void> {
    await this.metadataService.patch(
      context.metadataData.id,
      new MetadataEntity({ externalId: `${generationId}_0` }),
    );
    const additionalDocuments = await Promise.all(
      Array.from({ length: outputs - 1 }, () =>
        this.createAdditionalDocuments(context),
      ),
    );
    context.pendingIngredientIds.push(
      ...additionalDocuments.map(({ ingredientData }) =>
        ingredientData.id.toString(),
      ),
    );
    await Promise.all(
      additionalDocuments.map(({ metadataData }, index) =>
        this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({ externalId: `${generationId}_${index + 1}` }),
        ),
      ),
    );
    await Promise.all(
      additionalDocuments.map(({ ingredientData }) =>
        this.createPlaceholderActivity({
          authProviderUserId: context.user.id,
          brandId: context.brand.id,
          ingredientId: ingredientData.id,
          model: context.model,
          organization: context.publicMetadata.organization,
          user: context.publicMetadata.user,
        }),
      ),
    );
    this.loggerService.log(
      'Created multiple placeholders for batch-capable model multi-output',
      {
        generationId,
        isBatchSupported: true,
        model: context.model,
        outputs,
        pendingIngredientIds: context.pendingIngredientIds,
      },
    );
  }

  private async createSequentialOutputs(
    context: VideoGenerationContext,
    generationId: string,
    outputs: number,
  ): Promise<void> {
    await this.metadataService.patch(
      context.metadataData.id,
      new MetadataEntity({ externalId: generationId }),
    );

    for (let index = 1; index < outputs; index += 1) {
      const documents = await this.createAdditionalDocuments(context);
      context.pendingIngredientIds.push(documents.ingredientData.id.toString());
      const additionalGenerationId = await this.dispatch(context);
      if (!additionalGenerationId) {
        throw this.generationStartError(index + 1);
      }
      await Promise.all([
        this.metadataService.patch(
          documents.metadataData.id,
          new MetadataEntity({ externalId: additionalGenerationId }),
        ),
        this.videosService.patch(documents.ingredientData.id, {
          prompt: context.promptData.id,
        }),
      ]);
      await this.createPlaceholderActivity({
        authProviderUserId: context.user.id,
        brandId: context.brand.id,
        ingredientId: documents.ingredientData.id,
        model: context.model,
        organization: context.publicMetadata.organization,
        user: context.publicMetadata.user,
      });
    }

    this.loggerService.log(
      'Created multiple API calls for non-batch model multi-output',
      {
        isBatchSupported: false,
        model: context.model,
        outputs,
        pendingIngredientIds: context.pendingIngredientIds,
      },
    );
  }

  private createAdditionalDocuments(
    context: VideoGenerationContext,
  ): Promise<VideoGenerationSaveDocumentsResult> {
    return this.sharedService.saveDocuments(context.user, {
      ...context.createVideoDto,
      brand: context.brand.id,
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.VIDEO,
      ),
      extension: MetadataExtension.MP4,
      height: context.height,
      model: context.model,
      organization: context.brand.organizationId,
      prompt: context.promptData.id,
      references:
        context.referenceIds.length > 0 ? context.referenceIds : undefined,
      status: IngredientStatus.PROCESSING,
      style:
        context.createVideoDto.style === ''
          ? null
          : context.createVideoDto.style,
      width: context.width,
    });
  }

  private async dispatch(
    context: VideoGenerationContext,
  ): Promise<string | null> {
    const result = await this.providerDispatchService.dispatch({
      duration: context.createVideoDto.duration,
      height: context.height,
      imageUrl: context.referenceImageUrls[0],
      model: context.model,
      prompt: context.promptInput.prompt || '',
      promptParams: context.promptParams,
      width: context.width,
    });
    return result.externalId;
  }

  private generationStartError(output?: number): HttpException {
    return new HttpException(
      {
        detail: output
          ? `Video generation failed to start for output ${output}`
          : 'Video generation failed to start',
        title: 'Generation failed',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async failPendingOutputs(
    context: VideoGenerationContext,
    error: unknown,
  ): Promise<void> {
    this.loggerService.error('VideoGenerationService create failed', error);
    await Promise.all(
      context.pendingIngredientIds.map((pendingId) =>
        this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          pendingId,
          WebSocketPaths.video(pendingId),
          context.user.id,
          getUserRoomName(context.user.id),
          {
            brand: context.brand.id.toString(),
            key: ActivityKey.VIDEO_FAILED,
            organization: context.publicMetadata.organization,
            source: ActivitySource.VIDEO_GENERATION,
            user: context.publicMetadata.user,
            value: JSON.stringify({
              error: (error as Error)?.message || 'Generation failed',
              ingredientId: pendingId,
            }),
          },
        ),
      ),
    );
  }

  private async createPlaceholderActivity(
    params: CreateVideoPlaceholderActivityParams,
  ): Promise<void> {
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: params.brandId,
        entityId: params.ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organization: params.organization,
        source: ActivitySource.VIDEO_GENERATION,
        user: params.user,
        value: JSON.stringify({
          ingredientId: params.ingredientId.toString(),
          model: params.model,
          type: 'generation',
        }),
      }),
    );
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Video Generation',
      progress: 0,
      room: getUserRoomName(params.authProviderUserId),
      status: 'processing',
      taskId: params.ingredientId.toString(),
      userId: params.authProviderUserId,
    });
  }
}
