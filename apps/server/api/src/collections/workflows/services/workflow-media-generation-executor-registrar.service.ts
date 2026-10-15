import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import {
  currentWorkflowGenerationDispatch,
  runWithWorkflowGenerationDispatch,
} from '@api/collections/workflow-executions/services/workflow-generation-dispatch.context';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowFalOutputFinalizationService } from '@api/collections/workflows/services/workflow-fal-output-finalization.service';
import type { ValidatedWorkflowMediaDispatch } from '@api/collections/workflows/services/workflow-media-billing-plan.service';
import { WorkflowMediaDispatchAdmissionService } from '@api/collections/workflows/services/workflow-media-dispatch-admission.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import {
  type WorkflowUpscaleFunding,
  WorkflowUpscaleFundingService,
} from '@api/collections/workflows/services/workflow-upscale-funding.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { isReplicateSubmissionRejected } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { MediaLocalizationService } from '@api/services/media-localization/media-localization.service';
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
  LocalizeSpeechExecutor,
  ReframeExecutor,
  TextToSpeechExecutor,
  UpscaleExecutor,
  VideoGenExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class WorkflowMediaGenerationExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    private readonly providerPlan: WorkflowMediaProviderPlanService,
    @Optional() private readonly elevenLabsService?: ElevenLabsService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly byokService?: ByokService,
    @Optional()
    private readonly mediaLocalizationService?: MediaLocalizationService,
    @Optional()
    private readonly dispatchAdmission?: WorkflowMediaDispatchAdmissionService,
    @Optional() private readonly falVideo?: FalVideoGenerationProviderAdapter,
    @Optional()
    private readonly falOutputFinalization?: WorkflowFalOutputFinalizationService,
    @Optional()
    private readonly upscaleFunding?: WorkflowUpscaleFundingService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerImageGenExecutor(engine);
    this.registerVideoGenExecutor(engine);
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
    if (!this.replicateService && !this.falVideo) {
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
      if (prepared.provider !== 'replicate') {
        if (!funded || !this.falVideo || !this.falOutputFinalization) {
          throw new BusinessLogicException(
            'Fal workflow execution requires its funded native dispatch adapter',
          );
        }
        const falVideo = this.falVideo;
        const finalization = this.falOutputFinalization;
        const pending = await this.dispatchFundedMedia(funded, () =>
          this.helper.createAndLinkProcessingOutput({
            continuation: {
              actionId: 'videoGen',
              context,
              isByok: Boolean(funded.credential),
              node,
              provider: 'fal',
            },
            output: prepared.output,
            resultUrl: (id) => this.helper.buildVideoIngredientUrl(id),
            runProvider: async () => {
              const result = await falVideo.generate({
                apiKeyOverride: funded.credential?.apiKey,
                model: prepared.model,
                modelProvider: 'fal',
                organizationId: context.organizationId,
                preparedFalDispatch: prepared.preparedFalDispatch,
                prompt: prepared.output.generationPrompt ?? '',
                promptParams: prepared.input,
                width: 0,
                height: 0,
              });
              if (result.completion !== 'remote-output' || !result.externalId) {
                throw new BusinessLogicException(
                  'Fal returned no accepted remote video',
                );
              }
              return {
                externalId: result.externalId,
                completionQuantities: result.completionQuantities,
              };
            },
            onProviderAccepted: async (_output, continuationId) => {
              await finalization.finalize(
                continuationId,
                context.organizationId,
              );
            },
          }),
        );
        return {
          generationBriefEvidence: prepared.generationBriefEvidence,
          generationSource: prepared.generationSource,
          id: pending.ingredientId,
          model,
          provider: 'fal',
          status: IngredientStatus.PROCESSING,
          videoUrl: this.helper.buildVideoIngredientUrl(pending.ingredientId),
        };
      }
      if (!replicateService)
        throw new Error('Replicate workflow provider is unavailable');
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
      upscaleExecutor.setResolver((mediaUrl, params, context, node) =>
        this.runFundedUpscale(mediaUrl, params, context, node),
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

  /**
   * Prices the upscale from the stored source before anything dispatches: an
   * unstored, foreign or unmeasured source is refused here, the output is bound
   * to its hold before Replicate sees the job, and the callback settles it.
   */
  private async runFundedUpscale(
    mediaUrl: string,
    params: { model: string; scale: string },
    context: ExecutionContext,
    node: ExecutableNode,
  ) {
    const replicateService = this.replicateService;
    if (!replicateService || !this.upscaleFunding) {
      throw new Error('Upscale funding is unavailable');
    }
    const asset = await this.helper.requireMediaAsset(
      mediaUrl,
      context.organizationId,
      [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
    );
    const brandId =
      this.helper.readConfigString(node.config, 'brandId') ?? asset.brandId;
    const isVideo = asset.category === IngredientCategory.VIDEO;
    const funding = await this.upscaleFunding.fund({
      brandId,
      category: asset.category,
      organizationId: context.organizationId,
      scale: params.scale,
      source: asset,
      targetFps: node.config.fps,
      targetResolution: node.config.resolution,
      userId: context.userId,
    });
    try {
      const pending = await this.helper.createAndLinkProcessingOutput({
        continuation: {
          actionId: 'upscale',
          context,
          node,
          provider: 'replicate',
        },
        output: {
          brandId,
          category: asset.category,
          extension: isVideo ? MetadataExtension.MP4 : MetadataExtension.JPG,
          model: funding.model,
          organizationId: context.organizationId,
          parentIngredientId: asset.id,
          transformations: [TransformationCategory.UPSCALED],
          userId: context.userId,
        },
        resultUrl: (ingredientId) =>
          this.helper.buildMediaIngredientUrl(ingredientId, asset.category),
        runProvider: (ingredientId, continuationId) =>
          this.dispatchFundedUpscale(
            funding,
            { context, continuationId, ingredientId },
            () =>
              replicateService.runModel(
                funding.model,
                {
                  [isVideo ? 'video' : 'image']: funding.sourceUrl,
                  ...funding.providerInput,
                },
                undefined,
                continuationId,
              ),
          ),
      });
      return {
        id: pending.ingredientId,
        mediaUrl: this.helper.buildMediaIngredientUrl(
          pending.ingredientId,
          asset.category,
        ),
        model: params.model,
        scale: params.scale,
        status: IngredientStatus.PROCESSING,
      };
    } finally {
      await funding.releasePool();
    }
  }

  /**
   * Binds the output to its hold, then submits. Funds go back only when the
   * provider never saw the job or definitively refused it; an ambiguous
   * failure keeps the hold for the callback or reconciliation to resolve.
   */
  private async dispatchFundedUpscale<T>(
    funding: WorkflowUpscaleFunding,
    target: {
      context: ExecutionContext;
      continuationId: string;
      ingredientId: string;
    },
    submit: () => Promise<T>,
  ): Promise<T> {
    let isSubmissionStarted = false;
    try {
      await funding.bind(target.ingredientId);
      isSubmissionStarted = true;
      return await submit();
    } catch (error: unknown) {
      if (!isSubmissionStarted) {
        await this.helper.failProviderContinuationSubmission({
          continuationId: target.continuationId,
          error: error instanceof Error ? error.message : String(error),
          organizationId: target.context.organizationId,
        });
      }
      if (!isSubmissionStarted || isReplicateSubmissionRejected(error))
        await funding.reject(target.ingredientId);
      throw error;
    }
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

  private authorizeMediaDispatch(
    node: ExecutableNode,
    context: ExecutionContext,
  ): Promise<ValidatedWorkflowMediaDispatch | undefined> {
    return (
      this.dispatchAdmission?.authorize(node, context) ??
      Promise.resolve(undefined)
    );
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
