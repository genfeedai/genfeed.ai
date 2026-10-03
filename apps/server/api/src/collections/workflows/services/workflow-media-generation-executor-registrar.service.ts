import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import {
  currentWorkflowGenerationDispatch,
  runWithWorkflowGenerationDispatch,
} from '@api/collections/workflow-executions/services/workflow-generation-dispatch.context';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import {
  type ValidatedWorkflowMediaDispatch,
  WorkflowMediaBillingPlanService,
} from '@api/collections/workflows/services/workflow-media-billing-plan.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { workflowExecutionGenerationBillingSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import { ByokService } from '@api/services/byok/byok.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { MediaLocalizationService } from '@api/services/media-localization/media-localization.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  type ExecutableNode,
  type ExecutionContext,
  ImageGenExecutor,
  LipSyncExecutor,
  LocalizeSpeechExecutor,
  ReframeExecutor,
  TextToSpeechExecutor,
  UpscaleExecutor,
  VideoGenExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class WorkflowMediaGenerationExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    private readonly providerPlan: WorkflowMediaProviderPlanService,
    @Optional() private readonly heyGenService?: HeyGenService,
    @Optional() private readonly elevenLabsService?: ElevenLabsService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly byokService?: ByokService,
    @Optional()
    private readonly mediaLocalizationService?: MediaLocalizationService,
    @Optional() private readonly billingPlan?: WorkflowMediaBillingPlanService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
    @Optional() private readonly personasService?: PersonasService,
  ) {}

  private async processingMediaUrl(
    organizationId: string,
    asset: {
      id: string;
      objectKey?: string;
      storageKey: string;
      storageType: string;
    },
  ): Promise<string> {
    if (this.configService?.isAuthorizedMediaDeliveryEnabled) {
      if (!this.authorizedMediaUrls)
        throw new Error('Authorized media issuer is unavailable');
      const urls = await this.authorizedMediaUrls.issueServerPublish(
        organizationId,
        [asset.id],
      );
      const url = urls.get(asset.id);
      if (!url) throw new Error('The source asset has no authorized media URL');
      return url;
    }
    if (!this.filesClientService)
      throw new Error('File storage service is unavailable');
    return asset.objectKey
      ? this.filesClientService.getPresignedDownloadUrlForObjectKey(
          asset.objectKey,
        )
      : this.filesClientService.getPresignedDownloadUrl(
          asset.storageKey,
          asset.storageType,
        );
  }

  register(engine: WorkflowEngine): void {
    this.registerImageGenExecutor(engine);
    this.registerVideoGenExecutor(engine);
    this.registerLipSyncExecutor(engine);
    this.registerLocalizationExecutors(engine);
    this.registerTextToSpeechExecutor(engine);
    this.registerReframeExecutor(engine);
    this.registerUpscaleExecutor(engine);
  }

  private registerImageGenExecutor(engine: WorkflowEngine): void {
    if (!this.providerPlan.canPrepareImage || !this.replicateService) {
      return;
    }

    const imageGenExecutor = new ImageGenExecutor();
    const replicateService = this.replicateService;

    imageGenExecutor.setResolver(async (model, params, context, node) => {
      const funded = await this.authorizeMediaDispatch(node, context);
      const prepared =
        funded?.prepared.actionId === 'imageGen'
          ? funded.prepared
          : await this.providerPlan.prepareImage({
              model,
              params,
              context,
              node,
            });
      const byok = funded
        ? funded.credential
        : await this.byokService?.resolveApiKey(
            context.organizationId,
            ByokProvider.REPLICATE,
          );
      const pendingOutput = await this.dispatchFundedMedia(funded, () =>
        this.helper.createAndLinkProcessingOutput({
          continuation: {
            actionId: 'imageGen',
            context,
            isByok: Boolean(byok),
            node,
            provider: 'replicate',
          },
          output: prepared.output,
          resultUrl: (ingredientId) =>
            this.helper.buildImageIngredientUrl(ingredientId),
          runProvider: (_ingredientId, continuationId) =>
            replicateService.runModel(
              model,
              prepared.input,
              byok?.apiKey,
              continuationId,
            ),
        }),
      );

      return {
        generationBriefEvidence: prepared.generationBriefEvidence,
        generationSource: prepared.generationSource,
        id: pendingOutput.ingredientId,
        imageUrl: this.helper.buildImageIngredientUrl(
          pendingOutput.ingredientId,
        ),
        model,
        provider: 'replicate',
        status: IngredientStatus.PROCESSING,
      };
    });

    engine.registerExecutor(
      'imageGen',
      this.helper.wrapEngineExecutor(imageGenExecutor),
    );
  }

  private registerVideoGenExecutor(engine: WorkflowEngine): void {
    if (!this.replicateService) {
      return;
    }

    const videoGenExecutor = new VideoGenExecutor();
    const replicateService = this.replicateService;

    videoGenExecutor.setResolver(async (model, params, context, node) => {
      const funded = await this.authorizeMediaDispatch(node, context);
      const prepared =
        funded?.prepared.actionId === 'videoGen'
          ? funded.prepared
          : await this.providerPlan.prepareVideo({
              model,
              params,
              context,
              node,
            });
      const byok = funded
        ? funded.credential
        : await this.byokService?.resolveApiKey(
            context.organizationId,
            ByokProvider.REPLICATE,
          );
      const pendingOutput = await this.dispatchFundedMedia(funded, () =>
        this.helper.createAndLinkProcessingOutput({
          continuation: {
            actionId: 'videoGen',
            context,
            isByok: Boolean(byok),
            node,
            provider: 'replicate',
          },
          output: prepared.output,
          resultUrl: (ingredientId) =>
            this.helper.buildVideoIngredientUrl(ingredientId),
          runProvider: (_ingredientId, continuationId) =>
            replicateService.runModel(
              model,
              prepared.input,
              byok?.apiKey,
              continuationId,
            ),
        }),
      );

      return {
        generationBriefEvidence: prepared.generationBriefEvidence,
        generationSource: prepared.generationSource,
        id: pendingOutput.ingredientId,
        ...(prepared.identityLock
          ? { identityLock: prepared.identityLock }
          : {}),
        model,
        provider: 'replicate',
        status: IngredientStatus.PROCESSING,
        videoUrl: this.helper.buildVideoIngredientUrl(
          pendingOutput.ingredientId,
        ),
      };
    });

    engine.registerExecutor(
      'videoGen',
      this.helper.wrapEngineExecutor(videoGenExecutor),
    );
  }

  private registerLipSyncExecutor(engine: WorkflowEngine): void {
    const executor = new LipSyncExecutor();
    executor.setResolver(
      async (mediaValue, audioValue, options, context, node) => {
        if (!this.filesClientService)
          throw new Error('Media file service is unavailable');
        const media = await this.helper.requireMediaAsset(
          mediaValue,
          context.organizationId,
          [
            IngredientCategory.VIDEO,
            IngredientCategory.IMAGE,
            IngredientCategory.AVATAR,
          ],
        );
        const audio = await this.helper.requireMediaAsset(
          audioValue,
          context.organizationId,
          [
            IngredientCategory.MUSIC,
            IngredientCategory.VOICE,
            IngredientCategory.AUDIO,
          ],
        );
        const configuredBrandId = this.helper.readConfigString(
          node.config,
          'brandId',
        );
        if (configuredBrandId && configuredBrandId !== media.brandId) {
          throw new Error('Lip-sync brand must match the source asset brand');
        }
        if (audio.brandId !== media.brandId) {
          throw new Error(
            'Lip-sync source media and audio must belong to the same brand',
          );
        }
        // A character the brand can no longer use is refused before dispatch.
        const personaId = (
          await this.personasService?.resolveCharacterReferences({
            brandId: media.brandId,
            ingredientIds: [media.id],
            organizationId: context.organizationId,
            path: 'lip-sync',
          })
        )?.personaId;
        const isVideo = media.category === IngredientCategory.VIDEO;
        const mode = isVideo ? 'video' : 'image';
        if (options.mode && options.mode !== mode) {
          throw new Error(
            'Lip-sync mode does not match the selected source asset',
          );
        }
        const model =
          options.model ??
          (isVideo ? 'sync/lipsync-2' : MODEL_KEYS.HEYGEN_AVATAR);
        if (
          isVideo
            ? !['sync/lipsync-2', 'sync/lipsync-2-pro'].includes(model)
            : model !== MODEL_KEYS.HEYGEN_AVATAR
        ) {
          throw new Error(
            'Select a compatible lip-sync model for the source media',
          );
        }
        if (isVideo ? !this.replicateService : !this.heyGenService) {
          throw new Error('Selected lip-sync provider is unavailable');
        }
        const [mediaUrl, audioUrl] = await Promise.all([
          this.processingMediaUrl(context.organizationId, media),
          this.processingMediaUrl(context.organizationId, audio),
        ]);
        const provider = isVideo ? 'replicate' : 'heygen';
        const byok = await this.byokService?.resolveApiKey(
          context.organizationId,
          isVideo ? ByokProvider.REPLICATE : ByokProvider.HEYGEN,
        );
        const pending = await this.helper.createAndLinkProcessingOutput({
          output: {
            brandId: media.brandId,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            model,
            organizationId: context.organizationId,
            userId: context.userId,
            parentIngredientId: media.id,
            personaId,
            references: [media.id, audio.id],
            transformations: [TransformationCategory.LIP_SYNCED],
          },
          continuation: {
            actionId: 'lipSync',
            context,
            isByok: Boolean(byok),
            node,
            provider,
          },
          resultUrl: (id) => this.helper.buildVideoIngredientUrl(id),
          runProvider: async (id, continuationId) => {
            if (isVideo && this.replicateService) {
              return this.replicateService.runModel(
                model,
                {
                  video: mediaUrl,
                  audio: audioUrl,
                  sync_mode: options.syncMode ?? 'silence',
                },
                byok?.apiKey,
                continuationId,
              );
            }
            if (!this.heyGenService) throw new Error('HeyGen is unavailable');
            return this.heyGenService.generatePhotoAvatarVideo(
              id,
              mediaUrl,
              audioUrl,
              context.organizationId,
              context.userId,
              byok?.apiKey,
            );
          },
        });
        return {
          id: pending.ingredientId,
          status: IngredientStatus.PROCESSING,
          videoUrl: this.helper.buildVideoIngredientUrl(pending.ingredientId),
        };
      },
    );
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerLocalizationExecutors(engine: WorkflowEngine): void {
    const localizer = this.mediaLocalizationService;
    if (!localizer) return;
    const executor = new LocalizeSpeechExecutor();
    executor.setResolver(async (video, options, context) => {
      const source = await this.helper.requireMediaAsset(
        video,
        context.organizationId,
        [IngredientCategory.VIDEO],
      );
      return localizer.localize({
        ...options,
        videoId: source.id,
        organizationId: context.organizationId,
        userId: context.userId,
      });
    });
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
    engine.registerExecutor(
      'separateDialogue',
      async (node, inputs, context) => {
        const source = await this.helper.requireMediaAsset(
          inputs.get('video') ?? inputs.get('audio'),
          context.organizationId,
          [
            IngredientCategory.VIDEO,
            IngredientCategory.MUSIC,
            IngredientCategory.VOICE,
            IngredientCategory.AUDIO,
          ],
        );
        return localizer.separateDialogue({
          videoId: source.id,
          brandId: this.helper.readConfigString(node.config, 'brandId'),
          organizationId: context.organizationId,
          userId: context.userId,
        });
      },
    );
  }

  private registerTextToSpeechExecutor(engine: WorkflowEngine): void {
    const ttsExecutor = new TextToSpeechExecutor();

    if (this.elevenLabsService) {
      const elevenLabsService = this.elevenLabsService;

      ttsExecutor.setResolver(async (text, voiceId, context, node) => {
        const brandId = this.helper.requireBrandId(
          this.helper.readConfigString(node.config, 'brandId'),
          'textToSpeech',
        );
        const pendingOutput = await this.helper.createWorkflowOutputIngredient({
          brandId,
          category: IngredientCategory.MUSIC,
          extension: MetadataExtension.MP3,
          organizationId: context.organizationId,
          userId: context.userId,
        });
        let result: Awaited<
          ReturnType<ElevenLabsService['generateAndUploadAudio']>
        >;
        try {
          const byok = await this.byokService?.resolveApiKey(
            context.organizationId,
            ByokProvider.ELEVENLABS,
          );
          result = await elevenLabsService.generateAndUploadAudio(
            voiceId,
            text,
            pendingOutput.ingredientId,
            context.organizationId,
            context.userId,
            byok?.apiKey,
            {
              languageCode: this.helper.readConfigString(
                node.config,
                'language',
              ),
              speed:
                typeof node.config.speed === 'number'
                  ? node.config.speed
                  : undefined,
            },
          );
        } catch (error) {
          await this.helper.patchIngredient(pendingOutput.ingredientId, {
            status: IngredientStatus.FAILED,
          });
          throw error;
        }

        await this.helper.patchMetadata(
          pendingOutput.metadataId,
          new MetadataEntity({
            ...result.uploadResult,
            duration: result.duration,
            result: result.audioUrl,
          }),
        );
        await this.helper.patchIngredient(pendingOutput.ingredientId, {
          status: IngredientStatus.GENERATED,
        });

        return {
          audioUrl: this.helper.buildMusicIngredientUrl(
            pendingOutput.ingredientId,
          ),
          duration: result.duration,
          id: pendingOutput.ingredientId,
          status: IngredientStatus.GENERATED,
        };
      });

      this.loggerService.log(
        'WorkflowEngineAdapterService text-to-speech executor wired with ElevenLabs',
      );
    }

    engine.registerExecutor(
      ttsExecutor.nodeType,
      this.helper.wrapEngineExecutor(ttsExecutor),
    );
  }

  private registerReframeExecutor(engine: WorkflowEngine): void {
    const reframeExecutor = new ReframeExecutor();

    if (this.replicateService) {
      reframeExecutor.setResolver(async (mediaUrl, params, context, node) =>
        this.runReplicateMediaTransform({
          buildInput: (_isVideo, inputKey) => ({
            [inputKey]: mediaUrl,
            aspect_ratio: params.targetAspectRatio,
          }),
          buildReturn: (ingredientId, outputCategory) => ({
            format:
              outputCategory === IngredientCategory.VIDEO ? 'video' : 'image',
            id: ingredientId,
            mediaUrl: this.helper.buildMediaIngredientUrl(
              ingredientId,
              outputCategory,
            ),
            status: IngredientStatus.PROCESSING,
            targetAspectRatio: params.targetAspectRatio,
          }),
          mediaUrl,
          modelImage: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
          modelVideo: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
          node,
          context,
          nodeType: 'reframe',
          transformation: TransformationCategory.REFRAMED,
        }),
      );

      this.loggerService.log(
        'WorkflowEngineAdapterService reframe executor wired with Replicate (Luma)',
      );
    }

    engine.registerExecutor(
      reframeExecutor.nodeType,
      this.helper.wrapEngineExecutor(reframeExecutor),
    );
  }

  private registerUpscaleExecutor(engine: WorkflowEngine): void {
    const upscaleExecutor = new UpscaleExecutor();

    if (this.replicateService) {
      upscaleExecutor.setResolver(async (mediaUrl, params, context, node) =>
        this.runReplicateMediaTransform({
          buildInput: (isVideo, inputKey) => {
            const input: Record<string, unknown> = { [inputKey]: mediaUrl };
            if (!isVideo) {
              input.upscale_factor = params.scale;
            }
            return input;
          },
          buildReturn: (ingredientId, outputCategory) => ({
            id: ingredientId,
            mediaUrl: this.helper.buildMediaIngredientUrl(
              ingredientId,
              outputCategory,
            ),
            model: params.model,
            scale: params.scale,
            status: IngredientStatus.PROCESSING,
          }),
          mediaUrl,
          modelImage: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
          modelVideo: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
          node,
          context,
          nodeType: 'upscale',
          transformation: TransformationCategory.UPSCALED,
        }),
      );

      this.loggerService.log(
        'WorkflowEngineAdapterService upscale executor wired with Replicate (Topaz)',
      );
    }

    engine.registerExecutor(
      upscaleExecutor.nodeType,
      this.helper.wrapEngineExecutor(upscaleExecutor),
    );
  }

  private async runReplicateMediaTransform<TOutput>(params: {
    mediaUrl: string;
    context: ExecutionContext;
    node: ExecutableNode;
    nodeType: string;
    modelVideo: string;
    modelImage: string;
    transformation: TransformationCategory;
    buildInput: (isVideo: boolean, inputKey: string) => Record<string, unknown>;
    buildReturn: (
      ingredientId: string,
      outputCategory: IngredientCategory,
    ) => TOutput;
  }): Promise<TOutput> {
    const replicateService = this.replicateService;
    if (!replicateService) {
      throw new Error('Replicate service is not available');
    }

    const outputCategory = this.helper.resolveMediaOutputCategory(
      params.mediaUrl,
    );
    const isVideo = outputCategory === IngredientCategory.VIDEO;
    const model = isVideo ? params.modelVideo : params.modelImage;
    const inputKey = isVideo ? 'video' : 'image';
    const parentIngredientId = this.helper.extractIngredientId(params.mediaUrl);
    const brandId = await this.helper.resolveBrandIdFromInputOrFail(
      this.helper.readConfigString(params.node.config, 'brandId'),
      params.mediaUrl,
      params.nodeType,
      params.context.organizationId,
    );
    const pendingOutput = await this.helper.createAndLinkProcessingOutput({
      continuation: {
        actionId: params.nodeType,
        context: params.context,
        node: params.node,
        provider: 'replicate',
      },
      output: {
        brandId,
        category: outputCategory,
        extension: isVideo ? MetadataExtension.MP4 : MetadataExtension.JPG,
        model,
        organizationId: params.context.organizationId,
        parentIngredientId,
        transformations: [params.transformation],
        userId: params.context.userId,
      },
      resultUrl: (ingredientId) =>
        this.helper.buildMediaIngredientUrl(ingredientId, outputCategory),
      runProvider: (_ingredientId, continuationId) =>
        replicateService.runModel(
          model,
          params.buildInput(isVideo, inputKey),
          undefined,
          continuationId,
        ),
    });

    return params.buildReturn(pendingOutput.ingredientId, outputCategory);
  }

  private async authorizeMediaDispatch(
    node: ExecutableNode,
    context: ExecutionContext,
  ): Promise<ValidatedWorkflowMediaDispatch | undefined> {
    if (!context.executionId || !this.billingPlan || !this.prisma) {
      return undefined;
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      select: {
        generationAdmissionSource: true,
        generationBilling: true,
      },
      where: {
        id: context.executionId,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });
    if (!execution) {
      throw new BusinessLogicException('Workflow execution is unavailable');
    }
    if (!execution.generationAdmissionSource && !execution.generationBilling) {
      return undefined;
    }
    if (!execution.generationBilling) {
      throw new BusinessLogicException(
        'Workflow funded dispatch is unavailable',
      );
    }
    const dispatch = currentWorkflowGenerationDispatch();
    if (
      !dispatch ||
      dispatch.executionId !== context.executionId ||
      dispatch.organizationId !== context.organizationId
    ) {
      throw new BusinessLogicException(
        'Workflow dispatch context is unavailable',
      );
    }
    return this.billingPlan.validateDispatch({
      context: { ...context, executionId: context.executionId },
      executionId: context.executionId,
      funding: workflowExecutionGenerationBillingSchema.parse(
        execution.generationBilling,
      ),
      inputs: dispatch.inputs,
      node,
      operationId: dispatch.operationId,
    });
  }

  private async dispatchFundedMedia<T>(
    funded: ValidatedWorkflowMediaDispatch | undefined,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (!funded) {
      return callback();
    }
    const current = currentWorkflowGenerationDispatch();
    if (
      !current ||
      current.executionId !== funded.executionId ||
      current.operationId !== funded.operationId
    ) {
      throw new BusinessLogicException(
        'Workflow dispatch context is unavailable',
      );
    }
    return runWithWorkflowGenerationDispatch(
      {
        ...current,
        dispatchFingerprint: funded.dispatchFingerprint,
      },
      callback,
    );
  }
}
