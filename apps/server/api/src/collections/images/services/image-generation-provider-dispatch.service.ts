import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
  ImageGenerationProviderResult,
  ImageGenerationSaveDocumentsResult,
  ImageGenerationSavedIngredient,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import {
  allocateBatchDocuments,
  failUnproducedBatchOutput,
  requireExternalId,
} from '@api/collections/images/services/image-generation-batch.util';
import {
  completeImageGeneration,
  releaseImageOutput,
} from '@api/collections/images/services/image-generation-completion.util';
import {
  resolveImageDispatchExecutePath,
  shouldFailAdditionalActivity,
  shouldTrackSequentialOutputInResponse,
} from '@api/collections/images/services/image-generation-dispatch-path.util';
import {
  isProcessingIngredient,
  missingOutputUrlMessage,
  optionalUploadString,
  shouldFinalizeExternalOutput,
} from '@api/collections/images/services/image-generation-output.util';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ImageGenerationReceiptsService } from '@api/collections/images/services/image-generation-receipts.service';
import {
  applyRoutedDispatch,
  installRoutedFallback,
} from '@api/collections/images/services/image-generation-routed-dispatch.util';
import { ImagesService } from '@api/collections/images/services/images.service';
import { prepareImageGenerationProvider } from '@api/collections/images/services/prepare-image-generation-provider.util';
import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import { isGenerationCancelledError } from '@api/collections/ingredients/errors/generation-cancelled.error';
import { ProviderGenerationFailedError } from '@api/collections/ingredients/errors/provider-generation-failed.error';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { toRedactedGenerationBriefProviderData } from '@api/services/generation-brief';
import { isReplicateSubmissionRejected } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

type OutputDocument = Pick<
  ImageGenerationSaveDocumentsResult,
  'ingredientData' | 'metadataData'
>;

/**
 * Coordinates provider-neutral output persistence and completion behavior.
 * Provider request construction and response normalization live in the typed
 * adapters behind {@link ImageGenerationProviderRegistryService}.
 */
@Injectable()
export class ImageGenerationProviderDispatchService {
  private readonly acceptedOutputs = new WeakMap<
    ImageGenerationContext,
    Set<string>
  >();
  private readonly batchDocuments = new WeakMap<
    ImageGenerationContext,
    OutputDocument[]
  >();

  private readonly activeDocument = new WeakMap<
    ImageGenerationContext,
    OutputDocument
  >();

  private readonly submissionStarted = new WeakMap<
    ImageGenerationContext,
    Set<string>
  >();

  private beginSubmission(
    context: ImageGenerationContext,
    ingredientIds: readonly string[],
  ): void {
    const started = this.submissionStarted.get(context) ?? new Set<string>();
    for (const id of ingredientIds) started.add(id);
    this.submissionStarted.set(context, started);
  }

  constructor(
    private readonly activityRecorder: ActivityRecorderService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly filesClientService: FilesClientService,
    private readonly generationBilling: GenerationBillingService,
    private readonly generationEventWebhookService: GenerationEventWebhookService,
    private readonly mediaGenerationCostService: MediaGenerationCostService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly receipts: ImageGenerationReceiptsService,
  ) {}

  supports(
    model: string,
    provider?: ImageGenerationContext['modelProvider'],
  ): boolean {
    return this.providerRegistry.supports(model, provider);
  }

  generateCrunQuoted(
    user: AuthenticatedUser,
    dto: CreateImageDto,
    request: RequestWithContext,
    hasUnsupportedContext: boolean,
  ) {
    return this.providerRegistry.generateCrunQuoted(
      user,
      dto,
      request,
      hasUnsupportedContext,
    );
  }

  async dispatch(
    context: ImageGenerationContext,
  ): Promise<ImageGenerationCompletionPlan | null> {
    const quote = (context.request as unknown as DeferredCreditsRequest)
      .creditsConfig?.modelQuote;
    const routed = quote?.routedDispatch;
    if (quote && routed) {
      await applyRoutedDispatch(this.metadataService, context, quote, routed);
    }
    const byokApiKeyOverride = (
      context.request as unknown as DeferredCreditsRequest | undefined
    )?.creditsConfig?.byokApiKeyOverride;
    const provider = await this.prepareProvider(context, byokApiKeyOverride);

    if (!provider || provider.completionKind === 'none') {
      return null;
    }

    if (quote && routed?.fallback && !byokApiKeyOverride) {
      installRoutedFallback(
        {
          metadataService: this.metadataService,
          getActiveDocument: (current) => this.activeDocument.get(current),
          prepareProvider: (current) => this.prepareProvider(current),
        },
        context,
        provider,
        quote,
        routed,
        routed.fallback,
      );
    }

    const externalProvider =
      context.routedDispatch?.provider ??
      this.providerRegistry.providerFor(context.model, context.modelProvider);
    if (externalProvider) {
      await this.metadataService.patch(
        context.metadataData.id,
        new MetadataEntity({ externalProvider }),
      );
    }

    const pollIds = [context.ingredientData.id.toString()];
    const billing = this.billingRequest(context);
    if (context.outputs > 1) {
      // Further outputs are bound as they are created, after this request has
      // returned, so the request hold must outlive the response.
      this.generationBilling.deferPoolRelease(billing);
    }
    let generationPromise: Promise<unknown>;
    try {
      try {
        await this.admitOutput(context, context.ingredientData.id);
      } catch (error: unknown) {
        // A rejected admission would otherwise leave the placeholder PROCESSING.
        await this.handleProviderFailure(
          context,
          error,
          'Image output admission',
        );
      }
      if (
        context.editing &&
        context.outputs > 1 &&
        provider.outputStrategy === 'batch'
      ) {
        const documents: ImageGenerationSaveDocumentsResult[] = [
          {
            ingredientData: context.ingredientData,
            metadataData: context.metadataData,
          },
        ];
        this.batchDocuments.set(context, documents);
        try {
          for (let index = 1; index < context.outputs; index += 1) {
            const output = await this.createAdditionalDocuments(context);
            documents.push(output);
            await this.admitOutput(context, output.ingredientData.id);
            context.pendingIngredientIds.push(
              output.ingredientData.id.toString(),
            );
          }
        } catch (error: unknown) {
          await Promise.all(
            documents.map(({ ingredientData }) =>
              this.handleProviderFailure(
                context,
                error,
                'Image editing batch admission failed',
                ingredientData.id,
              ).catch(() => undefined),
            ),
          );
          this.batchDocuments.delete(context);
          throw error;
        }
      }
      generationPromise = this.execute(context, provider, pollIds);
    } catch (error: unknown) {
      await this.generationBilling.releasePool(billing);
      throw error;
    }
    if (context.outputs > 1) {
      generationPromise = generationPromise.finally(() =>
        this.generationBilling.releasePool(billing),
      );
    }

    return {
      generationPromise,
      kind: provider.completionKind,
      ...(provider.completionKind === 'poll-multiple' ? { pollIds } : {}),
    };
  }

  private prepareProvider(
    context: ImageGenerationContext,
    apiKeyOverride?: string,
  ) {
    return prepareImageGenerationProvider(
      context,
      {
        providerRegistry: this.providerRegistry,
        metadataService: this.metadataService,
        getBatchDocuments: (current) => this.batchDocuments.get(current),
        getActiveDocument: (current) => this.activeDocument.get(current),
        beginSubmission: (current, ids) => this.beginSubmission(current, ids),
        patchExternalId: (metadataId, result, current, ingredientId) =>
          this.patchExternalId(metadataId, result, current, ingredientId),
      },
      apiKeyOverride,
    );
  }

  async createPlaceholderActivity(
    context: ImageGenerationContext,
    ingredientId: string,
  ): Promise<void> {
    const activity = await this.activityRecorder.record({
      brandId: context.brand.id,
      entityId: ingredientId,
      entityModel: ActivityEntityModel.INGREDIENT,
      key: ActivityKey.IMAGE_PROCESSING,
      organizationId: context.user.organizationId,
      source: ActivitySource.IMAGE_GENERATION,
      userId: context.user.userId,
      value: JSON.stringify({
        ingredientId: ingredientId.toString(),
        model: context.model,
        type: 'generation',
      }),
    });

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Image Generation',
      progress: 0,
      room: getUserRoomName(context.user.id),
      status: 'processing',
      taskId: ingredientId.toString(),
      userId: context.user.id,
    });
  }

  failPlaceholderBeforeDispatch(
    context: ImageGenerationContext,
    error: unknown,
  ): Promise<never> {
    return this.handleProviderFailure(
      context,
      error,
      'Image generation placeholder linkage',
    );
  }

  private execute(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<unknown> {
    const path = resolveImageDispatchExecutePath({
      outputStrategy: provider.outputStrategy,
      outputs: context.outputs,
    });
    if (path === 'batch') {
      return this.executeBatch(context, provider, pollIds);
    }
    if (path === 'sequential') {
      return this.executeSequential(context, provider, pollIds);
    }
    return this.executeSingle(context, provider);
  }

  private async executeSingle(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
  ): Promise<string> {
    try {
      if (!provider.tracksSubmissionStarted)
        this.beginSubmission(context, [context.ingredientData.id]);
      const result = await provider.generate();
      const externalId = requireExternalId(result);
      await this.patchExternalId(
        context.metadataData.id,
        result,
        context,
        context.ingredientData.id,
      );
      await this.finalizeReturnedOutput(
        context,
        context.ingredientData.id,
        context.metadataData.id,
        result,
      );
      return externalId;
    } catch (error: unknown) {
      return this.handleProviderFailure(context, error, provider.failureLabel);
    }
  }

  private async executeBatch(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<string> {
    const documents: OutputDocument[] = [
      {
        ingredientData: context.ingredientData,
        metadataData: context.metadataData,
      },
    ];
    try {
      // Every batch output must exist and be funded before the provider accepts the batch.
      const preallocated = context.editing
        ? this.batchDocuments.get(context)
        : undefined;
      const additionalDocuments = await allocateBatchDocuments(
        context,
        preallocated,
        (current) => this.createAdditionalDocuments(current),
        (current, id) => this.admitOutput(current, id),
        (output) => documents.push(output),
      );
      this.batchDocuments.set(context, documents);
      if (!provider.tracksSubmissionStarted)
        this.beginSubmission(
          context,
          documents.map(({ ingredientData }) => ingredientData.id),
        );
      const result = await provider.generate();
      const generationId = requireExternalId(result);
      for (const { ingredientData } of documents)
        this.markAccepted(context, ingredientData.id);
      await Promise.all(
        documents.map(({ ingredientData, metadataData }, index) =>
          this.patchExternalId(
            metadataData.id,
            {
              kind: 'external-id',
              externalId: `${generationId}_${index}`,
              ...(result.kind === 'external-id' && result.promptId
                ? { promptId: result.promptId }
                : {}),
            },
            context,
            ingredientData.id,
          ),
        ),
      );
      await Promise.all(
        documents.map(({ ingredientData, metadataData }, index) =>
          result.kind === 'external-id' &&
          result.outputUrls &&
          index >= result.outputUrls.length
            ? this.markUnproducedBatchOutput(context, ingredientData.id)
            : this.finalizeReturnedOutput(
                context,
                ingredientData.id,
                metadataData.id,
                result,
                index,
              ),
        ),
      );
      await Promise.all(
        additionalDocuments.map(({ ingredientData }) =>
          this.createPlaceholderActivity(context, ingredientData.id),
        ),
      );
      additionalDocuments.forEach(({ ingredientData }) => {
        pollIds.push(ingredientData.id.toString());
      });

      this.loggerService.log(
        'Created multiple placeholders for batch-capable model multi-output',
        {
          generationId,
          isBatchSupported: true,
          model: context.model,
          outputs: context.outputs,
        },
      );
      return generationId;
    } catch (error: unknown) {
      const outputIds =
        documents.length > 0
          ? documents.map(({ ingredientData }) => ingredientData.id)
          : [context.ingredientData.id];
      await Promise.all(
        outputIds.map(async (id) => {
          try {
            await this.handleProviderFailure(
              context,
              error,
              provider.failureLabel,
              id,
            );
          } catch {
            /* Return the original dispatch failure after cleanup. */
          }
        }),
      );
      throw error;
    } finally {
      this.batchDocuments.delete(context);
    }
  }

  private async markUnproducedBatchOutput(
    context: ImageGenerationContext,
    ingredientId: string,
  ): Promise<void> {
    if (
      await this.claimOutputDisposition(context, ingredientId, () =>
        failUnproducedBatchOutput(this.imagesService, context, ingredientId),
      )
    )
      await releaseImageOutput(this.completionServices, context, ingredientId);
  }

  private async executeSequential(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<string> {
    let primaryId: string;
    try {
      if (!provider.tracksSubmissionStarted)
        this.beginSubmission(context, [context.ingredientData.id]);
      const primaryResult = await provider.generate();
      primaryId = requireExternalId(primaryResult);
      await this.patchExternalId(
        context.metadataData.id,
        primaryResult,
        context,
        context.ingredientData.id,
      );
      await this.finalizeReturnedOutput(
        context,
        context.ingredientData.id,
        context.metadataData.id,
        primaryResult,
      );
    } catch (error: unknown) {
      return this.handleProviderFailure(context, error, provider.failureLabel);
    }

    for (let index = 1; index < context.outputs; index += 1) {
      await this.createSequentialOutput(context, provider, pollIds);
    }

    if (context.outputs > 1 && !provider.trackAdditionalOutputsInResponse) {
      this.loggerService.log(
        'Created multiple API calls for non-batch model multi-output',
        {
          isBatchSupported: false,
          model: context.model,
          outputs: context.outputs,
        },
      );
    }
    return primaryId;
  }

  private async createSequentialOutput(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<void> {
    let ingredientId: ImageGenerationSavedIngredient['id'] | null = null;
    try {
      const documents = await this.createAdditionalDocuments(context);
      ingredientId = documents.ingredientData.id;
      await this.admitOutput(context, ingredientId);
      this.activeDocument.set(context, documents);
      if (!provider.tracksSubmissionStarted)
        this.beginSubmission(context, [ingredientId]);
      const result = await provider.generate();
      await Promise.all([
        this.patchExternalId(
          documents.metadataData.id,
          result,
          context,
          documents.ingredientData.id,
        ),
        this.imagesService.patch(documents.ingredientData.id, {
          promptId: context.promptData.id,
        }),
      ]);
      await this.finalizeReturnedOutput(
        context,
        documents.ingredientData.id,
        documents.metadataData.id,
        result,
      );

      try {
        await this.createPlaceholderActivity(
          context,
          documents.ingredientData.id,
        );
      } catch (activityError: unknown) {
        if (shouldFailAdditionalActivity(provider.additionalActivityFailure)) {
          throw activityError;
        }
        this.loggerService.error(
          'Failed to publish placeholder activity for additional output',
          { error: activityError },
        );
      }

      const id = documents.ingredientData.id.toString();
      if (
        shouldTrackSequentialOutputInResponse(
          provider.trackAdditionalOutputsInResponse,
        )
      ) {
        context.pendingIngredientIds.push(id);
      } else {
        pollIds.push(id);
      }
    } catch (error: unknown) {
      if (ingredientId) {
        return this.handleProviderFailure(
          context,
          error,
          provider.additionalFailureLabel,
          ingredientId,
        );
      }
      this.loggerService.error(
        `${provider.additionalPlaceholderFailureLabel} additional output failed before its placeholder was created`,
        error,
      );
      throw error;
    } finally {
      this.activeDocument.delete(context);
    }
  }

  private createAdditionalDocuments(
    context: ImageGenerationContext,
  ): Promise<ImageGenerationSaveDocumentsResult> {
    return this.sharedService.createMediaDocuments(context.user, {
      origin: IngredientOrigin.GENERATED,
      brandId: context.brand.id,
      category: IngredientCategory.IMAGE,
      extension: MetadataExtension.JPG,
      generationPrompt:
        context.generationHarness?.enhancedPrompt ??
        context.promptData.original,
      generationHarness: context.generationHarness,
      generationSeed: context.createImageDto.seed,
      ...(context.generationSource
        ? { generationSource: context.generationSource }
        : {}),
      ...(context.editing
        ? {
            providerData: { imageEdit: { ...context.editing.recipe } },
            width: context.width,
            height: context.height,
          }
        : context.briefEvidence
          ? {
              providerData: toRedactedGenerationBriefProviderData(
                context.briefEvidence,
              ),
            }
          : {}),
      model: context.model,
      negativePrompt: context.createImageDto.negativePrompt,
      organizationId: context.user.organizationId,
      parentId: context.ingredientData.parentId ?? undefined,
      personaId: context.personaId,
      promptId: context.promptData.id,
      scope: context.createImageDto.scope,
      sourceIds: context.referenceIds,
      ...(context.editing
        ? { sourceActionId: context.createImageDto.sourceActionId }
        : {}),
      status: IngredientStatus.PROCESSING,
      style: context.style,
      tagIds: context.createImageDto.tags,
    });
  }

  private markAccepted(
    context: ImageGenerationContext,
    ingredientId: string,
  ): void {
    const ids = this.acceptedOutputs.get(context) ?? new Set<string>();
    ids.add(ingredientId.toString());
    this.acceptedOutputs.set(context, ids);
  }

  private async patchExternalId(
    metadataId: string,
    result: ImageGenerationProviderResult,
    context: ImageGenerationContext,
    ingredientId: string,
  ): Promise<void> {
    const externalId = requireExternalId(result);
    this.markAccepted(context, ingredientId);
    this.receipts.accepted(context, ingredientId, externalId);
    try {
      await this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          externalId,
          externalProvider:
            context.routedDispatch?.provider ??
            this.providerRegistry.providerFor(
              context.model,
              context.modelProvider,
            ) ??
            undefined,
          ...(result.kind === 'external-id' && result.promptId
            ? { promptId: result.promptId }
            : {}),
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        'Accepted image metadata persistence failed',
        error,
        { ingredientId },
      );
      try {
        await this.generationBilling.rememberAcceptedOutput({
          ingredientId: ingredientId.toString(),
          externalId,
          organizationId: context.user.organizationId,
          userId: context.user.userId,
        });
      } catch (recoveryError: unknown) {
        this.loggerService.error(
          'Accepted image attachment recovery failed; retain its funding',
          recoveryError,
          { ingredientId, externalId },
        );
      }
    }
  }

  private async finalizeReturnedOutput(
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSavedIngredient['id'],
    metadataId: string,
    result: ImageGenerationProviderResult,
    outputIndex = 0,
  ): Promise<void> {
    if (!shouldFinalizeExternalOutput(result)) {
      return;
    }

    const authorized = this.batchDocuments.get(context)?.length ?? 1;
    if ((result.outputUrls?.length ?? 0) > authorized) {
      await this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          result: JSON.stringify(result.outputUrls),
          error:
            'Provider returned more outputs than the funded dispatch manifest; recovery is required',
        }),
      );
      throw new Error(
        'Provider output cardinality exceeds the funded dispatch manifest',
      );
    }
    const current = await this.imagesService.findOne({
      id: ingredientId,
      organizationId: context.user.organizationId,
      isDeleted: false,
    });
    if (
      !isProcessingIngredient(current) &&
      !(
        current?.status === IngredientStatus.FAILED &&
        current.generationError === INGREDIENT_PROCESSING_TIMEOUT_ERROR
      )
    )
      return;

    const outputUrl = result.outputUrls?.[outputIndex];
    if (!outputUrl) {
      throw new Error(missingOutputUrlMessage(outputIndex));
    }

    const id = ingredientId.toString();
    const uploadMeta = await this.filesClientService.uploadToS3(id, 'images', {
      type: FileInputType.URL,
      url: outputUrl,
    });

    await this.metadataService.patch(
      metadataId,
      new MetadataEntity({
        height: uploadMeta.height,
        result: outputUrl,
        size: uploadMeta.size,
        width: uploadMeta.width,
      }),
    );
    const claimed = await this.claimOutputDisposition(context, ingredientId, {
      promptId: context.promptData.id,
      s3Key: optionalUploadString(uploadMeta.s3Key),
      status: IngredientStatus.GENERATED,
    });
    if (!claimed) return;
    await this.websocketService.publishVideoComplete(
      WebSocketPaths.image(ingredientId),
      { id, ingredientId: id, status: 'completed' },
      context.user.id,
      getUserRoomName(context.user.id),
    );

    await completeImageGeneration(
      this.completionServices,
      context,
      ingredientId,
      {
        mimeType: null,
        storageKey: optionalUploadString(uploadMeta.s3Key) ?? null,
        url: optionalUploadString(uploadMeta.publicUrl) ?? outputUrl,
      },
      { height: uploadMeta.height, width: uploadMeta.width },
    );
  }

  private async handleProviderFailure(
    context: ImageGenerationContext,
    error: unknown,
    label: string,
    ingredientId: ImageGenerationSavedIngredient['id'] = context.ingredientData
      .id,
  ): Promise<never> {
    if (isGenerationCancelledError(error)) {
      throw error;
    }

    if (
      ((this.billingRequest(context).creditsConfig?.modelQuote &&
        this.submissionStarted.get(context)?.has(ingredientId.toString())) ||
        this.acceptedOutputs.get(context)?.has(ingredientId.toString())) &&
      !(error instanceof ProviderGenerationFailedError) &&
      !isReplicateSubmissionRejected(error)
    ) {
      this.loggerService.error(
        'Accepted image postdispatch work failed; retain its funding',
        error,
        { ingredientId },
      );
      throw error;
    }
    const providerMessage = getErrorMessage(error);
    const errorMessage =
      providerMessage === INGREDIENT_PROCESSING_TIMEOUT_ERROR
        ? 'Generation failed'
        : providerMessage;
    const claimed = await this.claimOutputDisposition(context, ingredientId, {
      generationError: errorMessage,
      status: IngredientStatus.FAILED,
      isGenerationFailureConfirmed: true,
    });
    if (!claimed) throw error;
    this.loggerService.error(`${label} failed`, error);
    await releaseImageOutput(this.completionServices, context, ingredientId);
    await this.failedGenerationService.notifyFailedImageGeneration(
      ingredientId,
      WebSocketPaths.image(ingredientId),
      context.user,
      getUserRoomName(context.user.id),
      errorMessage,
    );

    await this.generationEventWebhookService.emitGenerationFailed({
      brandId: context.brand.id?.toString() ?? null,
      errorMessage,
      generationId: ingredientId.toString(),
      kind: 'image',
      model: context.model,
      organizationId: context.user.organizationId,
    });

    throw error;
  }

  /** Retry only the cron's projection; cancellation and confirmed failures keep ownership. */
  private async claimOutputDisposition(
    context: ImageGenerationContext,
    ingredientId: string,
    update: Parameters<ImagesService['patchAll']>[1] | (() => Promise<boolean>),
  ): Promise<boolean> {
    const where = {
      id: ingredientId,
      organizationId: context.user.organizationId,
      isDeleted: false,
    };
    const claim =
      typeof update === 'function'
        ? update
        : async () =>
            (
              await this.imagesService.patchAll(
                { ...where, status: IngredientStatus.PROCESSING },
                update,
              )
            ).modifiedCount === 1;
    if (await claim()) return true;
    const reopened = await this.imagesService.patchAll(
      {
        ...where,
        status: IngredientStatus.FAILED,
        generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
      },
      { status: IngredientStatus.PROCESSING, generationError: null },
    );
    return reopened.modifiedCount === 1 && (await claim());
  }

  private billingRequest(
    context: ImageGenerationContext,
  ): GenerationBillingRequest {
    return context.request as unknown as GenerationBillingRequest;
  }

  /** Opens the output's receipt and binds an even share of the reservation. */
  private async admitOutput(
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSavedIngredient['id'],
  ): Promise<void> {
    this.receipts.open(context, ingredientId);
    const request = this.billingRequest(context);
    const amount = request.creditsConfig?.amount;
    if (amount === undefined) {
      return;
    }
    await this.generationBilling.bindOutput(request, {
      credits: amount / Math.max(context.outputs, 1),
      ingredientId: ingredientId.toString(),
    });
  }

  private get completionServices() {
    return {
      generationBilling: this.generationBilling,
      loggerService: this.loggerService,
      mediaGenerationCostService: this.mediaGenerationCostService,
      generationEventWebhookService: this.generationEventWebhookService,
    };
  }
}
