import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type {
  CreateVideoPlaceholderActivityParams,
  VideoGenerationContext,
  VideoGenerationProviderResult,
  VideoGenerationSaveDocumentsResult,
} from '@api/collections/videos/services/video-generation.types';
import { emptyStyleToNull } from '@api/collections/videos/services/video-generation-model.util';
import {
  resolveVideoOutputPlacement,
  videoGenerationStartDetail,
} from '@api/collections/videos/services/video-generation-output.util';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { toRedactedVideoGenerationBriefProviderData } from '@api/services/generation-brief';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
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

type StartedVideoGeneration = VideoGenerationProviderResult & {
  externalId: string;
};

@Injectable()
export class VideoGenerationExecutionService {
  constructor(
    private readonly activityRecorder: ActivityRecorderService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly generationBilling: GenerationBillingService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly providerDispatchService: VideoGenerationProviderDispatchService,
    private readonly replicatePollQueueService: ReplicatePollQueueService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async execute(context: VideoGenerationContext): Promise<void> {
    const accepted = new Set<string>();
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
      const generation = await this.dispatch(context);

      const isBatchSupported =
        MODEL_OUTPUT_CAPABILITIES[context.model]?.isBatchSupported ?? false;
      const placement = resolveVideoOutputPlacement(isBatchSupported, outputs);
      if (placement === 'batch') {
        await this.createBatchOutputs(context, generation, outputs, accepted);
      } else if (placement === 'sequential') {
        await this.createSequentialOutputs(
          context,
          generation,
          outputs,
          accepted,
        );
      } else {
        await this.bindOutputCredits(
          context,
          context.ingredientData.id.toString(),
          outputs,
        );
        await this.metadataService.patch(
          context.metadataData.id,
          new MetadataEntity({ externalId: generation.externalId }),
        );
        accepted.add(context.ingredientData.id.toString());
        await this.completeOrScheduleOutput(
          context,
          context.ingredientData.id.toString(),
          generation,
        );
      }
    } catch (error: unknown) {
      await this.failPendingOutputs(context, error, accepted);
      throw this.toDispatchException(error);
    }
  }

  /**
   * Maps a typed, non-retryable provider failure to a client-facing
   * NestJS exception so it never leaves this service as an unhandled 500.
   * Any other error is rethrown unchanged.
   */
  private toDispatchException(error: unknown): unknown {
    if (
      error instanceof ReplicateProviderError &&
      error.statusCode === 402 &&
      !error.isRetryable
    ) {
      return new HttpException(
        {
          detail: 'Replicate reported insufficient credit for this request.',
          title: 'Provider out of credit',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return error;
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
    generation: StartedVideoGeneration,
    outputs: number,
    accepted: Set<string>,
  ): Promise<void> {
    const generationId = generation.externalId;
    await this.bindOutputCredits(
      context,
      context.ingredientData.id.toString(),
      outputs,
    );
    await this.metadataService.patch(
      context.metadataData.id,
      new MetadataEntity({ externalId: `${generationId}_0` }),
    );
    accepted.add(context.ingredientData.id.toString());
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
    for (const { ingredientData } of additionalDocuments) {
      await this.bindOutputCredits(
        context,
        ingredientData.id.toString(),
        outputs,
      );
    }
    await Promise.all(
      additionalDocuments.map(
        async ({ metadataData, ingredientData }, index) => {
          await this.metadataService.patch(
            metadataData.id,
            new MetadataEntity({
              externalId: `${generationId}_${index + 1}`,
              externalProvider: generation.provider,
            }),
          );
          accepted.add(ingredientData.id.toString());
        },
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
    await Promise.all(
      context.pendingIngredientIds.map((ingredientId, outputIndex) =>
        this.completeOrScheduleOutput(
          context,
          ingredientId,
          generation,
          outputIndex,
        ),
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
    generation: StartedVideoGeneration,
    outputs: number,
    accepted: Set<string>,
  ): Promise<void> {
    const generationId = generation.externalId;
    await this.bindOutputCredits(
      context,
      context.ingredientData.id.toString(),
      outputs,
    );
    await this.metadataService.patch(
      context.metadataData.id,
      new MetadataEntity({ externalId: generationId }),
    );
    accepted.add(context.ingredientData.id.toString());
    await this.completeOrScheduleOutput(
      context,
      context.ingredientData.id.toString(),
      generation,
    );

    for (let index = 1; index < outputs; index += 1) {
      const documents = await this.createAdditionalDocuments(context);
      context.pendingIngredientIds.push(documents.ingredientData.id.toString());
      const additionalGeneration = await this.dispatch(context, index + 1);
      await this.bindOutputCredits(
        context,
        documents.ingredientData.id.toString(),
        outputs,
      );
      await Promise.all([
        this.metadataService
          .patch(
            documents.metadataData.id,
            new MetadataEntity({
              externalId: additionalGeneration.externalId,
              externalProvider: additionalGeneration.provider,
            }),
          )
          .then(() => {
            accepted.add(documents.ingredientData.id.toString());
          }),
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
      await this.completeOrScheduleOutput(
        context,
        documents.ingredientData.id.toString(),
        additionalGeneration,
      );
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
      generationPrompt:
        context.generationHarness?.enhancedPrompt ??
        context.promptData.original,
      generationHarness: context.generationHarness,
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
    output?: number,
  ): Promise<StartedVideoGeneration> {
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
      apiKeyOverride: this.resolveByokApiKeyOverride(context),
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
    if (!result.externalId) {
      throw this.generationStartError(output);
    }
    return { ...result, externalId: result.externalId };
  }

  private async completeOrScheduleOutput(
    context: VideoGenerationContext,
    ingredientId: string,
    generation: StartedVideoGeneration,
    outputIndex?: number,
  ): Promise<void> {
    if (generation.completion === 'remote-output') {
      await this.webhooksService.processMediaForIngredient(
        ingredientId,
        IngredientCategory.VIDEO,
        generation.externalId,
        generation.externalId,
      );
      return;
    }
    if (
      generation.completion !== 'polling' ||
      generation.provider !== 'replicate'
    ) {
      return;
    }
    await this.replicatePollQueueService.schedule({
      category: IngredientCategory.VIDEO,
      externalId: generation.externalId,
      ingredientId,
      ...(this.resolveByokApiKeyOverride(context) ? { isByok: true } : {}),
      organizationId: context.user.organizationId,
      ...(outputIndex === undefined ? {} : { outputIndex }),
    });
  }

  private resolveByokApiKeyOverride(
    context: VideoGenerationContext,
  ): string | undefined {
    return (context.request as unknown as DeferredCreditsRequest | undefined)
      ?.creditsConfig?.byokApiKeyOverride;
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
    accepted = new Set<string>(),
  ): Promise<void> {
    this.loggerService.error('VideoGenerationService create failed', error);
    const failedIds = context.pendingIngredientIds.filter(
      (id) => !accepted.has(id),
    );
    await Promise.all(
      failedIds.map((pendingId) =>
        this.releaseOutputCredits(context, pendingId),
      ),
    );
    await Promise.all(
      failedIds.map((pendingId) =>
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

  /**
   * Binds one accepted output to an even share of the request's credit hold,
   * before its provider id is persisted so a fast webhook finds the hold.
   */
  private async bindOutputCredits(
    context: VideoGenerationContext,
    ingredientId: string,
    outputs: number,
  ): Promise<void> {
    const request = context.request as unknown as GenerationBillingRequest;
    const amount = request?.creditsConfig?.amount;
    if (amount === undefined) {
      return;
    }
    await this.generationBilling.bindOutput(request, {
      credits: amount / Math.max(outputs, 1),
      ingredientId,
    });
  }

  private async releaseOutputCredits(
    context: VideoGenerationContext,
    ingredientId: string,
  ): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(
        ingredientId,
        context.user.organizationId,
      );
    } catch (error: unknown) {
      this.loggerService.error('Video credit release failed', error, {
        ingredientId,
      });
    }
  }

  private async createPlaceholderActivity(
    params: CreateVideoPlaceholderActivityParams,
  ): Promise<void> {
    const activity = await this.activityRecorder.record({
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
    });
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
