import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  runImageGenerationBrief,
  runVideoGenerationBrief,
  toRedactedGenerationBriefProviderData,
  toRedactedVideoGenerationBriefProviderData,
} from '@api/services/generation-brief';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { MediaLocalizationService } from '@api/services/media-localization/media-localization.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
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
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

function replaceReferenceTokens(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string') {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceReferenceTokens(entry, replacements));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        replaceReferenceTokens(entry, replacements),
      ]),
    );
  }
  return value;
}

@Injectable()
export class WorkflowMediaGenerationExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly heyGenService?: HeyGenService,
    @Optional() private readonly elevenLabsService?: ElevenLabsService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly byokService?: ByokService,
    @Optional()
    private readonly mediaLocalizationService?: MediaLocalizationService,
  ) {}

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
    if (!this.promptBuilderService || !this.replicateService) {
      return;
    }

    const imageGenExecutor = new ImageGenExecutor();
    const promptBuilderService = this.promptBuilderService;
    const replicateService = this.replicateService;

    imageGenExecutor.setResolver(async (model, params, context, node) => {
      const references = Array.isArray(params.references)
        ? params.references.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : undefined;
      const prompt = typeof params.prompt === 'string' ? params.prompt : '';
      const height = typeof params.height === 'number' ? params.height : 1080;
      const width = typeof params.width === 'number' ? params.width : 1920;
      const negativePrompt =
        typeof params.negativePrompt === 'string'
          ? params.negativePrompt
          : undefined;
      const compiled = runImageGenerationBrief({
        avoid: negativePrompt ? [negativePrompt] : undefined,
        height,
        model: model as string,
        objective: prompt,
        referenceIds: [],
        seed: typeof params.seed === 'number' ? params.seed : undefined,
        surface: 'workflow',
        visualDirection:
          typeof params.style === 'string' ? params.style : undefined,
        width,
      });
      const compiledInput = compiled.dispatch
        ? {
            ...compiled.dispatch,
            ...(references?.[0] ? { image: references[0] } : {}),
            ...(typeof params.strength === 'number'
              ? { strength: params.strength }
              : {}),
          }
        : undefined;
      const { input } = compiledInput
        ? { input: compiledInput }
        : await promptBuilderService.buildPrompt(
            model as string,
            {
              height,
              modelCategory: ModelCategory.IMAGE,
              negativePrompt,
              prompt,
              references,
              seed: typeof params.seed === 'number' ? params.seed : undefined,
              strength:
                typeof params.strength === 'number'
                  ? params.strength
                  : undefined,
              style:
                typeof params.style === 'string' ? params.style : undefined,
              width,
            },
            undefined,
          );
      const brandId = this.helper.requireBrandId(params.brandId, 'imageGen');
      const pendingOutput = await this.helper.createAndLinkProcessingOutput({
        continuation: {
          actionId: 'imageGen',
          context,
          node,
          provider: 'replicate',
        },
        output: {
          brandId,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          externalId: null,
          generationPrompt: prompt,
          generationSource: compiled.generationSource,
          model: model as string,
          negativePrompt,
          organizationId: context.organizationId,
          providerData: toRedactedGenerationBriefProviderData(
            compiled.evidence,
          ),
          userId: context.userId,
        },
        resultUrl: (ingredientId) =>
          this.helper.buildImageIngredientUrl(ingredientId),
        runProvider: (_ingredientId, continuationId) =>
          replicateService.runModel(model, input, undefined, continuationId),
      });

      return {
        generationBriefEvidence: compiled.evidence,
        generationSource: compiled.generationSource,
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
      const references = Array.isArray(params.references)
        ? params.references.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : undefined;
      const videoReferences = Array.isArray(params.videoReferences)
        ? params.videoReferences.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : undefined;
      const lastFrame =
        typeof params.lastFrame === 'string' ? params.lastFrame : undefined;
      const referenceReplacements = new Map<string, string>();
      const referenceAssetIds = references?.map((reference, index) => {
        const assetId =
          this.helper.extractIngredientId(reference) ??
          `workflow-image-reference-${index + 1}`;
        referenceReplacements.set(assetId, reference);
        return assetId;
      });
      const endFrameId = lastFrame
        ? (this.helper.extractIngredientId(lastFrame) ??
          'workflow-last-frame-reference')
        : undefined;
      if (endFrameId && lastFrame) {
        referenceReplacements.set(endFrameId, lastFrame);
      }
      const videoReferenceAssetIds = await Promise.all(
        (videoReferences ?? []).map(async (reference, index) => {
          const ingredientId = this.helper.extractIngredientId(reference);
          const assetId =
            ingredientId ?? `workflow-video-reference-${index + 1}`;
          const providerUrl =
            ingredientId && this.filesClientService
              ? await this.filesClientService.getPresignedDownloadUrl(
                  ingredientId,
                  'videos',
                )
              : reference;
          referenceReplacements.set(assetId, providerUrl);
          return assetId;
        }),
      );
      const prompt = typeof params.prompt === 'string' ? params.prompt : '';
      const height = typeof params.height === 'number' ? params.height : 1080;
      const width = typeof params.width === 'number' ? params.width : 1920;
      const duration =
        typeof params.duration === 'number' ? params.duration : undefined;
      const negativePrompt =
        typeof params.negativePrompt === 'string'
          ? params.negativePrompt
          : undefined;
      const compiled = runVideoGenerationBrief({
        actionVerb:
          params.actionVerb === 'extend' ? params.actionVerb : undefined,
        avoid: negativePrompt ? [negativePrompt] : undefined,
        durationSeconds: duration,
        endFrameId,
        height,
        model: model as string,
        objective: prompt,
        referenceIds: [],
        references: referenceAssetIds?.map((assetId) => ({
          assetId,
          role: 'first_frame' as const,
        })),
        seed: typeof params.seed === 'number' ? params.seed : undefined,
        surface: 'workflow',
        videoReferenceIds: videoReferenceAssetIds,
        width,
      });
      const input = compiled.dispatch
        ? (replaceReferenceTokens(
            compiled.dispatch,
            referenceReplacements,
          ) as Record<string, unknown>)
        : { prompt };
      const brandId = this.helper.requireBrandId(params.brandId, 'videoGen');
      const pendingOutput = await this.helper.createAndLinkProcessingOutput({
        continuation: {
          actionId: 'videoGen',
          context,
          node,
          provider: 'replicate',
        },
        output: {
          brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          externalId: null,
          generationPrompt: prompt,
          generationSource: compiled.generationSource,
          model: model as string,
          organizationId: context.organizationId,
          parentIngredientId:
            typeof params.parentIngredientId === 'string'
              ? params.parentIngredientId
              : undefined,
          providerData: toRedactedVideoGenerationBriefProviderData(
            compiled.evidence,
          ),
          references:
            typeof params.parentIngredientId === 'string'
              ? [params.parentIngredientId]
              : undefined,
          userId: context.userId,
        },
        resultUrl: (ingredientId) =>
          this.helper.buildVideoIngredientUrl(ingredientId),
        runProvider: (_ingredientId, continuationId) =>
          replicateService.runModel(model, input, undefined, continuationId),
      });

      return {
        generationBriefEvidence: compiled.evidence,
        generationSource: compiled.generationSource,
        id: pendingOutput.ingredientId,
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
        const [mediaUrl, audioUrl] = await Promise.all([
          this.filesClientService.getPresignedDownloadUrl(
            media.storageKey,
            media.storageType,
          ),
          this.filesClientService.getPresignedDownloadUrl(
            audio.storageKey,
            audio.storageType,
          ),
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
            references: [media.id, audio.id],
            transformations: [TransformationCategory.LIP_SYNCED],
          },
          continuation: { actionId: 'lipSync', context, node, provider },
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
}
