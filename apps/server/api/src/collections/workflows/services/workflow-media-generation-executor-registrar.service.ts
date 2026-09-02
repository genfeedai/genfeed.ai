import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
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
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
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
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerImageGenExecutor(engine);
    this.registerVideoGenExecutor(engine);
    this.registerLipSyncExecutor(engine);
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
    const lipSyncExecutor = new LipSyncExecutor();

    if (this.heyGenService) {
      const heyGenService = this.heyGenService;

      lipSyncExecutor.setResolver(
        async (mediaUrl, audioUrl, _options, context, node) => {
          const parentIngredientId = this.helper.extractIngredientId(mediaUrl);
          const audioIngredientId = this.helper.extractIngredientId(audioUrl);
          const brandId = await this.helper.resolveBrandIdFromInputOrFail(
            this.helper.readConfigString(node?.config, 'brandId'),
            mediaUrl,
            'lipSync',
            context.organizationId,
          );
          const pendingOutput = await this.helper.createAndLinkProcessingOutput(
            {
              output: {
                brandId,
                category: IngredientCategory.VIDEO,
                extension: MetadataExtension.MP4,
                model: MODEL_KEYS.HEYGEN_AVATAR,
                organizationId: context.organizationId,
                parentIngredientId,
                references: [parentIngredientId, audioIngredientId],
                transformations: [TransformationCategory.LIP_SYNCED],
                userId: context.userId,
              },
              continuation: {
                actionId: 'lipSync',
                context,
                node,
                provider: 'heygen',
              },
              resultUrl: (ingredientId) =>
                this.helper.buildVideoIngredientUrl(ingredientId),
              runProvider: (ingredientId) =>
                heyGenService.generatePhotoAvatarVideo(
                  ingredientId,
                  mediaUrl,
                  audioUrl,
                ),
            },
          );

          return {
            id: pendingOutput.ingredientId,
            status: IngredientStatus.PROCESSING,
            videoUrl: this.helper.buildVideoIngredientUrl(
              pendingOutput.ingredientId,
            ),
          };
        },
      );

      this.loggerService.log(
        'WorkflowEngineAdapterService lip sync executor wired with HeyGen',
      );
    }

    engine.registerExecutor(
      lipSyncExecutor.nodeType,
      this.helper.wrapEngineExecutor(lipSyncExecutor),
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
        const result = await elevenLabsService.generateAndUploadAudio(
          voiceId,
          text,
          pendingOutput.ingredientId,
        );

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
