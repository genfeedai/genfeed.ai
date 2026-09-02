import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type {
  CreateVideoPlaceholderActivityParams,
  VideoGenerationContext,
  VideoGenerationSaveDocumentsResult,
} from '@api/collections/videos/services/video-generation.types';
import { emptyStyleToNull } from '@api/collections/videos/services/video-generation-model.util';
import {
  resolveVideoOutputPlacement,
  videoGenerationStartDetail,
} from '@api/collections/videos/services/video-generation-output.util';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { toRedactedVideoGenerationBriefProviderData } from '@api/services/generation-brief';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
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
      brandId: context.brand.id,
      ingredientId: context.ingredientData.id,
      model: context.model,
      organizationId: context.user.organizationId,
      userId: context.user.userId ?? context.user.id,
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
      const placement = resolveVideoOutputPlacement(isBatchSupported, outputs);
      if (placement === 'batch') {
        await this.createBatchOutputs(context, generationId, outputs);
      } else if (placement === 'sequential') {
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

  async failPlaceholderBeforeDispatch(
    context: VideoGenerationContext,
    error: unknown,
  ): Promise<never> {
    await this.failPendingOutputs(context, error);
    throw error;
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
          brandId: context.brand.id,
          ingredientId: ingredientData.id,
          model: context.model,
          organizationId: context.user.organizationId,
          userId: context.user.userId ?? context.user.id,
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
          promptId: context.promptData.id,
        }),
      ]);
      await this.createPlaceholderActivity({
        brandId: context.brand.id,
        ingredientId: documents.ingredientData.id,
        model: context.model,
        organizationId: context.user.organizationId,
        userId: context.user.userId ?? context.user.id,
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
    return this.sharedService.createMediaDocuments(context.user, {
      brandId: context.brand.id,
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.VIDEO,
      ),
      duration: context.createVideoDto.duration,
      extension: MetadataExtension.MP4,
      generationPrompt: context.promptData.original,
      generationSeed: context.createVideoDto.seed,
      ...(context.generationSource
        ? { generationSource: context.generationSource }
        : {}),
      hasAudio: context.createVideoDto.isAudioEnabled,
      height: context.height,
      language: context.createVideoDto.language,
      model: context.model,
      negativePrompt: context.createVideoDto.negativePrompt,
      organizationId: context.brand.organizationId,
      ...(context.briefEvidence
        ? {
            providerData: toRedactedVideoGenerationBriefProviderData(
              context.briefEvidence,
            ),
          }
        : {}),
      promptId: context.promptData.id,
      resolution: context.createVideoDto.resolution,
      scope: context.createVideoDto.scope,
      sourceIds: [
        ...new Set([
          ...context.referenceIds,
          ...(context.createVideoDto.endFrame
            ? [context.createVideoDto.endFrame]
            : []),
          ...(context.createVideoDto.videoReferences ?? []),
        ]),
      ],
      status: IngredientStatus.PROCESSING,
      style: emptyStyleToNull(context.createVideoDto.style),
      tagIds: context.createVideoDto.tags,
      width: context.width,
    });
  }

  private async dispatch(
    context: VideoGenerationContext,
  ): Promise<string | null> {
    const externalProvider = this.providerDispatchService.providerFor(
      context.model,
      context.modelProvider,
    );
    if (externalProvider) {
      await this.metadataService.patch(
        context.metadataData.id,
        new MetadataEntity({ externalProvider }),
      );
    }
    const result = await this.providerDispatchService.dispatch({
      duration: context.createVideoDto.duration,
      height: context.height,
      imageUrl: context.referenceImageUrls[0],
      model: context.model,
      modelEndpoint: context.modelEndpoint,
      modelInputSchema: context.modelInputSchema,
      modelProvider: context.modelProvider,
      modelSchemaFamily: context.modelSchemaFamily,
      organizationId: context.user.organizationId,
      prompt: context.promptInput.prompt || '',
      promptParams: context.promptParams,
      width: context.width,
    });
    return result.externalId;
  }

  private generationStartError(output?: number): HttpException {
    return new HttpException(
      {
        detail: videoGenerationStartDetail(output),
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
            brandId: context.brand.id.toString(),
            key: ActivityKey.VIDEO_FAILED,
            organizationId: context.user.organizationId,
            source: ActivitySource.VIDEO_GENERATION,
            userId: context.user.userId,
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
        brandId: params.brandId,
        entityId: params.ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organizationId: params.organizationId,
        source: ActivitySource.VIDEO_GENERATION,
        userId: params.userId,
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
      room: getUserRoomName(params.userId),
      status: 'processing',
      taskId: params.ingredientId.toString(),
      userId: params.userId,
    });
  }
}
