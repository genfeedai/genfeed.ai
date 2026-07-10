import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  TransformationCategory,
} from '@genfeedai/enums';
import {
  ImageGenExecutor,
  LipSyncExecutor,
  ReframeExecutor,
  TextToSpeechExecutor,
  UpscaleExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';

export class WorkflowMediaGenerationExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    private readonly promptBuilderService?: PromptBuilderService,
    private readonly heyGenService?: HeyGenService,
    private readonly elevenLabsService?: ElevenLabsService,
    private readonly replicateService?: ReplicateService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerImageGenExecutor(engine);
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

    imageGenExecutor.setResolver(async (model, params, context) => {
      const references = Array.isArray(params.references)
        ? params.references.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : undefined;
      const { input } = await promptBuilderService.buildPrompt(
        model as string,
        {
          height: typeof params.height === 'number' ? params.height : undefined,
          modelCategory: ModelCategory.IMAGE,
          negativePrompt:
            typeof params.negativePrompt === 'string'
              ? params.negativePrompt
              : undefined,
          prompt: typeof params.prompt === 'string' ? params.prompt : '',
          references,
          seed: typeof params.seed === 'number' ? params.seed : undefined,
          strength:
            typeof params.strength === 'number' ? params.strength : undefined,
          style: typeof params.style === 'string' ? params.style : undefined,
          width: typeof params.width === 'number' ? params.width : undefined,
        },
        undefined,
      );
      const brandId = this.helper.requireBrandId(params.brandId, 'imageGen');
      const pendingOutput = await this.helper.createAndLinkProcessingOutput({
        output: {
          brandId,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          externalId: null,
          model: model as string,
          organizationId: context.organizationId,
          userId: context.userId,
        },
        resultUrl: (ingredientId) =>
          this.helper.buildImageIngredientUrl(ingredientId),
        runProvider: () => replicateService.runModel(model, input),
      });

      return {
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
    context: { organizationId: string; userId: string };
    node: { config: Record<string, unknown> };
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
      runProvider: () =>
        replicateService.runModel(model, params.buildInput(isVideo, inputKey)),
    });

    return params.buildReturn(pendingOutput.ingredientId, outputCategory);
  }
}
