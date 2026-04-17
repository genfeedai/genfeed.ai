import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import {
  isWorkflowInputNodeType,
  normalizeWorkflowNodeTypeToCanonical,
} from '@api/collections/workflows/node-type-aliases';
import type {
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowStep,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  CaptionFormat,
  CaptionLanguage,
  type CredentialPlatform,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  MusicSourceType,
  PostCategory,
  PostStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionContext,
  ExecutionOptions,
  ExecutionRunResult,
} from '@genfeedai/workflow-engine';
import {
  createBrandAssetExecutor,
  createImageGenExecutor,
  createLipSyncExecutor,
  createMentionTriggerExecutor,
  createNewFollowerTriggerExecutor,
  createNewLikeTriggerExecutor,
  createNewRepostTriggerExecutor,
  createPostReplyExecutor,
  createPromptConstructorExecutor,
  createReframeExecutor,
  createSendDmExecutor,
  createTextToSpeechExecutor,
  createUpscaleExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Shape of workflow document passed to convertToExecutableWorkflow.
 * Represents a minimal subset of WorkflowDocument needed for conversion.
 */
interface WorkflowDocumentShape {
  _id?: Types.ObjectId | { toString(): string };
  brands?: Array<Types.ObjectId | { toString(): string }>;
  id?: string;
  nodes?: WorkflowVisualNode[];
  edges?: WorkflowEdge[];
  lockedNodeIds?: string[];
  organization?: Types.ObjectId | { toString(): string };
  user?: Types.ObjectId | { toString(): string };
}

interface WrappedEngineExecutor {
  execute(input: {
    context: ExecutionContext;
    inputs: Map<string, unknown>;
    node: ExecutableNode;
  }): Promise<{ data: unknown }>;
}

/**
 * Maps visual-builder NODE_REGISTRY types (kebab-case) to
 * engine EXECUTOR_REGISTRY types (camelCase).
 *
 * Node types not in this map pass through unchanged — they either
 * already match an executor name or are handled by the noop executor.
 */
/**
 * Node types that are available in the UI but currently run with
 * guarded fallback behavior on the backend (safe pass-through / no-op).
 */
const FALLBACK_EXECUTOR_TYPES = [
  'ai-avatar-video',
  'ai-enhance',
  'ai-generate-video',
  'ai-transcribe',
  'control-loop',
  'effect-ken-burns',
  'effect-portrait-blur',
  'effect-split-screen',
  'effect-text-overlay',
  'effect-watermark',
  'input-prompt',
  'input-template',
  'workflowInput',
  'workflowOutput',
  'workflow-input',
  'workflow-output',
  'output-export',
  'output-notify',
  'output-save',
  'output-webhook',
  'process-compress',
  'process-extract-audio',
  'process-merge-videos',
  'process-mirror',
  'process-resize',
  'process-reverse',
  'process-transform',
  'process-trim',
] as const;

const NODE_TYPE_TO_EXECUTOR: Record<string, string> = {
  'ai-avatar-video': 'aiAvatarVideo',
  'ai-enhance': 'ai-enhance',
  'ai-generate-image': 'imageGen',
  'ai-generate-newsletter': 'newsletterGen',
  'ai-generate-post': 'postGen',
  'ai-generate-video': 'ai-generate-video',
  'ai-lip-sync': 'lipSync',
  'ai-llm': 'llm',
  'ai-prompt-constructor': 'promptConstructor',
  'ai-reframe': 'reframe',
  'ai-text-to-speech': 'textToSpeech',
  'ai-transcribe': 'ai-transcribe',
  'ai-upscale': 'upscale',
  'ai-voice-change': 'voiceChange',
  brandAsset: 'brandAsset',
  'control-branch': 'condition',
  'control-delay': 'delay',
  'control-loop': 'control-loop',
  'effect-captions': 'effect-captions',
  'effect-color-grade': 'colorGrade',
  'effect-ken-burns': 'effect-ken-burns',
  'effect-portrait-blur': 'effect-portrait-blur',
  'effect-split-screen': 'effect-split-screen',
  'effect-text-overlay': 'effect-text-overlay',
  'effect-watermark': 'effect-watermark',
  'input-image': 'input-image',
  'input-prompt': 'input-prompt',
  'input-template': 'input-template',
  'input-video': 'input-video',
  'output-export': 'output-export',
  'output-notify': 'output-notify',
  'output-publish': 'publish',
  'output-save': 'output-save',
  'output-webhook': 'output-webhook',
  'process-compress': 'process-compress',
  'process-extract-audio': 'process-extract-audio',
  'process-merge-videos': 'process-merge-videos',
  'process-mirror': 'process-mirror',
  'process-resize': 'process-resize',
  'process-reverse': 'process-reverse',
  'process-transform': 'process-transform',
  'process-trim': 'process-trim',
  // Social interaction nodes
  'social-post-reply': 'postReply',
  'social-send-dm': 'sendDm',
  'trigger-mention': 'mentionTrigger',
  'trigger-new-follower': 'newFollowerTrigger',
  'trigger-new-like': 'newLikeTrigger',
  'trigger-new-repost': 'newRepostTrigger',
};

/**
 * Bridges NestJS service layer with the pure workflow-engine package.
 * Converts Mongoose documents to engine-compatible format and wires
 * NestJS services as node executors.
 */
@Injectable()
export class WorkflowEngineAdapterService {
  private readonly logContext = 'WorkflowEngineAdapterService';
  private engine: WorkflowEngine;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly socialAdapterFactory?: SocialAdapterFactory,
    @Optional()
    private readonly avatarVideoGenerationService?: AvatarVideoGenerationService,
    @Optional() private readonly captionsService?: CaptionsService,
    @Optional() private readonly fileQueueService?: FileQueueService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly ingredientsService?: IngredientsService,
    @Optional() private readonly metadataService?: MetadataService,
    @Optional() private readonly musicsService?: MusicsService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly credentialsService?: CredentialsService,
    @Optional() private readonly newslettersService?: NewslettersService,
    @Optional() private readonly sharedService?: SharedService,
    @Optional()
    private readonly videoMusicOrchestrationService?: VideoMusicOrchestrationService,
    @Optional() private readonly whisperService?: WhisperService,
    @Optional() private readonly heyGenService?: HeyGenService,
    @Optional() private readonly elevenLabsService?: ElevenLabsService,
    @Optional() private readonly openRouterService?: OpenRouterService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly brandsService?: BrandsService,
  ) {
    this.engine = new WorkflowEngine({
      maxConcurrency: 3,
    });

    this.registerFallbackExecutors();
    this.registerReviewGateExecutor();
    this.registerSocialExecutors();
    this.registerAvatarVideoExecutor();
    this.registerImageGenExecutor();
    this.registerPromptConstructorExecutor();
    this.registerPostExecutor();
    this.registerNewsletterExecutor();
    this.registerCaptionsExecutor();
    this.registerLipSyncExecutor();
    this.registerMusicSourceExecutor();
    this.registerSoundOverlayExecutor();
    this.registerTextToSpeechExecutor();
    this.registerReframeExecutor();
    this.registerUpscaleExecutor();
    this.registerDirectMediaInputExecutors();
    this.registerBrandAssetExecutor();
  }

  /**
   * Registers guarded fallback executors for UI-available node types that
   * do not yet have a dedicated backend implementation.
   *
   * Behavior:
   * - If upstream input exists, pass through the most recent input value.
   * - If no upstream input exists, emit a structured skipped payload.
   */
  private registerFallbackExecutors(): void {
    for (const nodeType of FALLBACK_EXECUTOR_TYPES) {
      this.engine.registerExecutor(nodeType, async (node, inputs, context) => {
        this.loggerService.warn(
          `${this.logContext} fallback executor invoked`,
          {
            nodeId: node.id,
            nodeType,
            workflowId:
              typeof context.workflowId === 'string' ? context.workflowId : '',
          },
        );

        const inputValues = Array.from(inputs.values());
        if (inputValues.length > 0) {
          return inputValues[inputValues.length - 1];
        }

        return {
          nodeId: node.id,
          nodeType,
          reason: 'fallback_executor_no_upstream_input',
          status: 'skipped',
        };
      });
    }
  }

  private wrapEngineExecutor(executor: unknown): NodeExecutor {
    const wrappedExecutor = executor as WrappedEngineExecutor;

    return async (node, inputs, context) => {
      const result = await wrappedExecutor.execute({ context, inputs, node });

      return result.data;
    };
  }

  private registerReviewGateExecutor(): void {
    this.engine.registerExecutor('reviewGate', async (_node, inputs) => {
      const mediaInput = this.extractReviewGateInput(inputs, 'media');
      const captionInput = this.extractReviewGateInput(inputs, 'caption');

      return {
        approvalId: null,
        approvalStatus: 'pending',
        approvedAt: null,
        approvedBy: null,
        inputCaption: typeof captionInput === 'string' ? captionInput : null,
        inputMedia: this.extractMediaPreview(inputs.get('media')),
        outputCaption: null,
        outputMedia: null,
        rejectionReason: null,
        reviewGatePayload: {
          caption: captionInput,
          media: mediaInput,
        },
      };
    });
  }

  private registerImageGenExecutor(): void {
    if (
      !this.promptBuilderService ||
      !this.replicateService ||
      !this.sharedService ||
      !this.metadataService
    ) {
      return;
    }

    const imageGenExecutor = createImageGenExecutor();
    const promptBuilderService = this.promptBuilderService;
    const replicateService = this.replicateService;

    imageGenExecutor.setResolver(async (model, params, context) => {
      const references = Array.isArray(params.references)
        ? params.references.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : undefined;

      const negativePrompt =
        typeof params.negativePrompt === 'string'
          ? params.negativePrompt
          : undefined;
      const strength =
        typeof params.strength === 'number' ? params.strength : undefined;
      const style = typeof params.style === 'string' ? params.style : undefined;
      const prompt = typeof params.prompt === 'string' ? params.prompt : '';
      const width = typeof params.width === 'number' ? params.width : undefined;
      const height =
        typeof params.height === 'number' ? params.height : undefined;
      const seed = typeof params.seed === 'number' ? params.seed : undefined;

      const { input } = await promptBuilderService.buildPrompt(
        model as string,
        {
          height,
          modelCategory: ModelCategory.IMAGE,
          negativePrompt,
          prompt,
          references,
          seed,
          strength,
          style,
          width,
        },
        undefined,
      );

      const brandId = await this.resolveBrandIdFromConfigOrFail(
        params.brandId,
        'imageGen',
      );
      const pendingOutput = await this.createWorkflowOutputIngredient({
        brandId,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPG,
        externalId: null,
        model: model as string,
        organizationId: context.organizationId,
        userId: context.userId,
      });
      const predictionId = await replicateService.runModel(model, input);

      await this.metadataService?.patch(
        pendingOutput.metadataId,
        new MetadataEntity({
          externalId: predictionId,
          result: this.buildImageIngredientUrl(pendingOutput.ingredientId),
        }),
      );

      return {
        id: pendingOutput.ingredientId,
        imageUrl: this.buildImageIngredientUrl(pendingOutput.ingredientId),
        model,
        provider: 'replicate',
        status: IngredientStatus.PROCESSING,
      };
    });

    this.engine.registerExecutor(
      'imageGen',
      this.wrapEngineExecutor(imageGenExecutor),
    );
  }

  private registerDirectMediaInputExecutors(): void {
    this.engine.registerExecutor('input-image', async (node) =>
      this.resolveConfiguredMediaInput(node, 'image'),
    );
    this.engine.registerExecutor('input-video', async (node) =>
      this.resolveConfiguredMediaInput(node, 'video'),
    );
  }

  private registerBrandAssetExecutor(): void {
    if (!this.brandsService) {
      return;
    }

    const executor = createBrandAssetExecutor(
      async ({ assetType, brandId, organizationId }) => {
        if (
          !Types.ObjectId.isValid(brandId) ||
          !Types.ObjectId.isValid(organizationId)
        ) {
          return null;
        }

        const brand = await this.brandsService?.findOne(
          {
            _id: new Types.ObjectId(brandId),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
          },
          'detail',
        );

        if (!brand) {
          return null;
        }

        if (assetType === 'logo') {
          const logoId = this.getDocumentId(
            (brand as unknown as { logo?: unknown }).logo,
          );

          return {
            dimensions: null,
            mimeType: null,
            url: logoId ? this.buildLogoAssetUrl(logoId) : null,
            urls: [],
          };
        }

        if (assetType === 'banner') {
          const bannerId = this.getDocumentId(
            (brand as unknown as { banner?: unknown }).banner,
          );

          return {
            dimensions: null,
            mimeType: null,
            url: bannerId ? this.buildBannerAssetUrl(bannerId) : null,
            urls: [],
          };
        }

        const references = Array.isArray(
          (brand as unknown as { references?: unknown[] }).references,
        )
          ? (brand as unknown as { references: unknown[] }).references
          : [];
        const urls = references
          .map((reference) => this.getDocumentId(reference))
          .filter((id): id is string => typeof id === 'string')
          .map((id) => this.buildReferenceAssetUrl(id));

        return {
          dimensions: null,
          mimeType: null,
          url: urls[0] ?? null,
          urls,
        };
      },
    );

    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  private registerPromptConstructorExecutor(): void {
    const promptConstructorExecutor = createPromptConstructorExecutor();

    this.engine.registerExecutor(
      'promptConstructor',
      this.wrapEngineExecutor(promptConstructorExecutor),
    );
  }

  /**
   * Registers all social workflow executors with their platform adapters.
   * Uses the SocialAdapterFactory to wire platform-specific implementations.
   * If the factory is not available, executors are registered without adapters
   * (they will throw at runtime if invoked).
   */
  private registerSocialExecutors(): void {
    const platforms = this.socialAdapterFactory?.getSupportedPlatforms() ?? [];

    // Register one executor per social node type.
    // The executor's platform is resolved at execution time from node config,
    // so we register a single executor per type that dispatches to the correct adapter.
    const postReplyExecutor = createPostReplyExecutor();
    const sendDmExecutor = createSendDmExecutor();
    const followerTriggerExecutor = createNewFollowerTriggerExecutor();
    const mentionTriggerExecutor = createMentionTriggerExecutor();
    const likeTriggerExecutor = createNewLikeTriggerExecutor();
    const repostTriggerExecutor = createNewRepostTriggerExecutor();

    if (this.socialAdapterFactory && platforms.length > 0) {
      const socialAdapterFactory = this.socialAdapterFactory;

      // Wire dispatching publishers/checkers that route to the correct platform adapter
      postReplyExecutor.setPublisher((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createReplyPublisher()(params);
      });

      sendDmExecutor.setSender((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createDmSender()(params);
      });

      followerTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createFollowerChecker()(params);
      });

      mentionTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createMentionChecker()(params);
      });

      likeTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createLikeChecker()(params);
      });

      repostTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createRepostChecker()(params);
      });

      this.loggerService.log(
        `${this.logContext} social executors wired for platforms: ${platforms.join(', ')}`,
      );
    }

    // Wrap class executors as NodeExecutor functions
    this.engine.registerExecutor(
      postReplyExecutor.nodeType,
      this.wrapEngineExecutor(postReplyExecutor),
    );
    this.engine.registerExecutor(
      sendDmExecutor.nodeType,
      this.wrapEngineExecutor(sendDmExecutor),
    );
    this.engine.registerExecutor(
      followerTriggerExecutor.nodeType,
      this.wrapEngineExecutor(followerTriggerExecutor),
    );
    this.engine.registerExecutor(
      mentionTriggerExecutor.nodeType,
      this.wrapEngineExecutor(mentionTriggerExecutor),
    );
    this.engine.registerExecutor(
      likeTriggerExecutor.nodeType,
      this.wrapEngineExecutor(likeTriggerExecutor),
    );
    this.engine.registerExecutor(
      repostTriggerExecutor.nodeType,
      this.wrapEngineExecutor(repostTriggerExecutor),
    );
  }

  /**
   * Registers the lip sync executor with HeyGen as the backend provider.
   */
  private registerLipSyncExecutor(): void {
    const lipSyncExecutor = createLipSyncExecutor();

    if (this.heyGenService && this.metadataService) {
      const heyGenService = this.heyGenService;

      lipSyncExecutor.setResolver(
        async (mediaUrl, audioUrl, _options, context, node) => {
          const parentIngredientId = this.extractIngredientId(mediaUrl);
          const audioIngredientId = this.extractIngredientId(audioUrl);
          const brandId = await this.resolveBrandIdFromInputOrFail(
            this.readConfigString(node?.config, 'brandId'),
            mediaUrl,
            'lipSync',
          );
          const pendingOutput = await this.createWorkflowOutputIngredient({
            brandId,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            model: MODEL_KEYS.HEYGEN_AVATAR,
            organizationId: context.organizationId,
            parentIngredientId,
            references: [parentIngredientId, audioIngredientId],
            transformations: [TransformationCategory.LIP_SYNCED],
            userId: context.userId,
          });
          const videoId = await heyGenService.generatePhotoAvatarVideo(
            pendingOutput.ingredientId,
            mediaUrl,
            audioUrl,
          );

          await this.metadataService?.patch(
            pendingOutput.metadataId,
            new MetadataEntity({
              externalId: videoId,
              result: this.buildVideoIngredientUrl(pendingOutput.ingredientId),
            }),
          );

          return {
            id: pendingOutput.ingredientId,
            status: IngredientStatus.PROCESSING,
            videoUrl: this.buildVideoIngredientUrl(pendingOutput.ingredientId),
          };
        },
      );

      this.loggerService.log(
        `${this.logContext} lip sync executor wired with HeyGen`,
      );
    }

    this.engine.registerExecutor(
      lipSyncExecutor.nodeType,
      this.wrapEngineExecutor(lipSyncExecutor),
    );
  }

  private registerAvatarVideoExecutor(): void {
    const avatarVideoGenerationService = this.avatarVideoGenerationService;

    if (!avatarVideoGenerationService) {
      return;
    }

    this.engine.registerExecutor(
      'aiAvatarVideo',
      async (_node, inputs, context) => {
        const script = this.getRequiredStringInput(inputs, 'script');
        const result = await avatarVideoGenerationService.generateAvatarVideo(
          {
            aspectRatio: this.getAspectRatioConfig(_node.config.aspectRatio),
            audioUrl: this.getOptionalStringInput(inputs, 'audioUrl'),
            clonedVoiceId: this.getOptionalStringInput(inputs, 'clonedVoiceId'),
            photoUrl: this.getOptionalStringInput(inputs, 'photoUrl'),
            text: script,
            useIdentity:
              _node.config.useIdentityDefaults === undefined
                ? true
                : Boolean(_node.config.useIdentityDefaults),
          },
          {
            brandId: this.readConfigString(_node.config, 'brandId'),
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );

        return {
          externalId: result.externalId,
          id: result.ingredientId,
          status: result.status,
          video: {
            externalId: result.externalId,
            id: result.ingredientId,
            status: result.status,
          },
        };
      },
    );
  }

  private registerCaptionsExecutor(): void {
    const captionsService = this.captionsService;
    const fileQueueService = this.fileQueueService;
    const filesClientService = this.filesClientService;
    const ingredientsService = this.ingredientsService;
    const metadataService = this.metadataService;
    const sharedService = this.sharedService;
    const whisperService = this.whisperService;

    if (
      !captionsService ||
      !fileQueueService ||
      !filesClientService ||
      !ingredientsService ||
      !metadataService ||
      !sharedService ||
      !whisperService
    ) {
      return;
    }

    this.engine.registerExecutor(
      'effect-captions',
      async (node, inputs, context) => {
        const brandId = this.getRequiredBrandId(node);
        const sourceVideo = this.getVideoResultInput(inputs, 'video');
        const sourceIngredientId = this.extractIngredientId(sourceVideo);

        if (!sourceIngredientId) {
          throw new Error(
            'effect-captions requires a source video ingredient id',
          );
        }

        const captionContent =
          await whisperService.generateCaptions(sourceIngredientId);

        await captionsService.create(
          new CaptionEntity({
            content: captionContent,
            format: CaptionFormat.SRT,
            ingredient: new Types.ObjectId(sourceIngredientId),
            isDeleted: false,
            language: CaptionLanguage.EN,
            user: new Types.ObjectId(context.userId),
          }),
        );

        const { ingredientData, metadataData } =
          await sharedService.saveDocumentsInternal({
            brand: new Types.ObjectId(brandId),
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            organization: new Types.ObjectId(context.organizationId),
            parent: new Types.ObjectId(sourceIngredientId),
            status: IngredientStatus.PROCESSING,
            user: new Types.ObjectId(context.userId),
          });

        const ingredientId = ingredientData._id.toString();
        const job = await fileQueueService.processVideo({
          clerkUserId: context.userId,
          ingredientId,
          organizationId: context.organizationId,
          params: {
            captionContent,
            inputPath: `${this.configService.ingredientsEndpoint}/videos/${sourceIngredientId}`,
          },
          room: getUserRoomName(context.userId),
          type: 'add-captions',
          userId: context.userId,
          websocketUrl: `/videos/${ingredientId}`,
        });

        const result = await fileQueueService.waitForJob(job.jobId, 180_000);
        const outputPath = this.getRequiredJobOutputPath(result);

        const uploaded = await filesClientService.uploadToS3(
          ingredientId,
          'videos',
          {
            path: outputPath,
            type: FileInputType.FILE,
          },
        );

        await ingredientsService.patch(
          ingredientId,
          new IngredientEntity({
            status: IngredientStatus.GENERATED,
            transformations: [TransformationCategory.CAPTIONED],
          }),
        );
        await metadataService.patch(
          metadataData._id,
          new MetadataEntity(uploaded),
        );

        return {
          id: ingredientId,
          status: IngredientStatus.GENERATED,
          videoUrl: this.buildVideoIngredientUrl(ingredientId),
        };
      },
    );
  }

  private registerMusicSourceExecutor(): void {
    const musicsService = this.musicsService;

    if (!musicsService) {
      return;
    }

    this.engine.registerExecutor(
      'musicSource',
      async (node, inputs, context) => {
        const sourceType =
          (node.config.sourceType as MusicSourceType | undefined) ??
          MusicSourceType.LIBRARY;

        if (sourceType !== MusicSourceType.LIBRARY) {
          const uploadedUrl = this.getOptionalStringInput(inputs, 'uploadUrl');
          const generatedPrompt = this.getOptionalStringInput(
            inputs,
            'generatePrompt',
          );

          return {
            musicUrl: uploadedUrl ?? generatedPrompt ?? null,
            sourceType,
          };
        }

        const brandId = this.getRequiredBrandId(node);
        const music =
          (await musicsService.findOne({
            brand: new Types.ObjectId(brandId),
            isDeleted: false,
            organization: new Types.ObjectId(context.organizationId),
            status: IngredientStatus.GENERATED,
          })) ??
          (await musicsService.findOne({
            isDeleted: false,
            organization: new Types.ObjectId(context.organizationId),
            status: IngredientStatus.GENERATED,
          }));

        const musicId = this.getDocumentId(music);

        if (!music || !musicId) {
          throw new Error(
            'No generated music is available for this organization',
          );
        }

        return {
          musicIngredientId: musicId,
          musicUrl: this.buildMusicIngredientUrl(musicId),
          sourceType,
        };
      },
    );
  }

  private registerSoundOverlayExecutor(): void {
    const videoMusicOrchestrationService = this.videoMusicOrchestrationService;

    if (!videoMusicOrchestrationService) {
      return;
    }

    this.engine.registerExecutor(
      'soundOverlay',
      async (node, inputs, context) => {
        const brandId = this.getRequiredBrandId(node);
        const sourceVideo = this.getVideoResultInput(inputs, 'videoUrl');
        const videoIngredientId = this.extractIngredientId(sourceVideo);

        if (!videoIngredientId) {
          throw new Error('soundOverlay requires a source video ingredient id');
        }

        const soundSource = inputs.get('soundUrl');
        const musicIngredientId = this.extractMusicIngredientId(soundSource);

        if (!musicIngredientId) {
          throw new Error(
            'soundOverlay requires a library music ingredient from musicSource',
          );
        }

        const mergedIngredientId =
          await videoMusicOrchestrationService.mergeVideoWithMusic(
            videoIngredientId,
            musicIngredientId,
            this.getOptionalNumberConfig(node.config, 'audioVolume', 30),
            false,
            {
              brandId,
              clerkUserId: context.userId,
              organizationId: context.organizationId,
              userId: context.userId,
            },
          );

        return {
          id: mergedIngredientId,
          status: IngredientStatus.GENERATED,
          videoUrl: this.buildVideoIngredientUrl(mergedIngredientId),
        };
      },
    );
  }

  private registerPostExecutor(): void {
    const postsService = this.postsService;
    const credentialsService = this.credentialsService;
    const openRouterService = this.openRouterService;

    if (!postsService || !credentialsService || !openRouterService) {
      return;
    }

    this.engine.registerExecutor('postGen', async (node, _inputs, context) => {
      const brandId = this.readConfigString(node.config, 'brandId');
      const prompt = this.readConfigString(node.config, 'prompt');

      if (!brandId || !prompt) {
        throw new Error('postGen requires brandId and prompt');
      }

      const credentialId = this.readConfigString(node.config, 'credentialId');
      const brandLabel =
        this.readConfigString(node.config, 'brandLabel') ?? 'the brand';
      const timezone = this.readConfigString(node.config, 'timezone') ?? 'UTC';

      const credentialQuery: Record<string, unknown> = {
        brand: new Types.ObjectId(brandId),
        isConnected: true,
        isDeleted: false,
        organization: new Types.ObjectId(context.organizationId),
      };

      if (credentialId) {
        credentialQuery._id = new Types.ObjectId(credentialId);
      }

      const credential = await credentialsService.findOne(credentialQuery);

      if (!credential) {
        return {
          reason: 'missing_connected_credential',
          status: 'skipped',
        };
      }

      const completion = await openRouterService.chatCompletion({
        max_tokens: 500,
        messages: [
          {
            content:
              'You write concise, production-ready social media drafts. Return only the post body with no preamble.',
            role: 'system',
          },
          {
            content: [
              `Brand: ${brandLabel}`,
              `Prompt: ${prompt}`,
              'Write one clear social post draft that is specific and ready for review.',
            ].join('\n\n'),
            role: 'user',
          },
        ],
        model: 'openai/gpt-4o-mini',
        temperature: 0.6,
      });

      const description =
        completion.choices?.[0]?.message?.content?.trim() ??
        `Daily post draft for ${brandLabel}`;

      const post = await postsService.create({
        brand: new Types.ObjectId(brandId),
        category: PostCategory.TEXT,
        credential: credential._id as Types.ObjectId,
        description,
        ingredients: [],
        label: this.buildPostLabel(description),
        organization: new Types.ObjectId(context.organizationId),
        platform: credential.platform as CredentialPlatform,
        status: PostStatus.DRAFT,
        timezone,
        user: new Types.ObjectId(context.userId),
      });

      return {
        description: post.description,
        id: post._id.toString(),
        platform: post.platform,
        post: {
          id: post._id.toString(),
          label: post.label,
          status: post.status,
        },
        status: post.status,
      };
    });
  }

  private registerNewsletterExecutor(): void {
    const newslettersService = this.newslettersService;

    if (!newslettersService) {
      return;
    }

    this.engine.registerExecutor(
      'newsletterGen',
      async (node, _inputs, context) => {
        const brandId = this.readConfigString(node.config, 'brandId');
        const prompt = this.readConfigString(node.config, 'prompt');

        if (!brandId || !prompt) {
          throw new Error('newsletterGen requires brandId and prompt');
        }

        const instructions = this.readConfigString(node.config, 'instructions');

        const newsletter = await newslettersService.generateDraft(
          {
            instructions,
            topic: prompt,
          },
          {
            brandId,
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );

        return {
          id: newsletter._id.toString(),
          newsletter: {
            id: newsletter._id.toString(),
            label: newsletter.label,
            status: newsletter.status,
            topic: newsletter.topic,
          },
          status: newsletter.status,
          topic: newsletter.topic,
        };
      },
    );
  }

  /**
   * Registers the text-to-speech executor with ElevenLabs as the backend provider.
   */
  private registerTextToSpeechExecutor(): void {
    const ttsExecutor = createTextToSpeechExecutor();

    if (
      this.elevenLabsService &&
      this.sharedService &&
      this.metadataService &&
      this.ingredientsService
    ) {
      const elevenLabsService = this.elevenLabsService;

      ttsExecutor.setResolver(async (text, voiceId, context, node) => {
        const brandId = await this.resolveBrandIdFromConfigOrFail(
          this.readConfigString(node.config, 'brandId'),
          'textToSpeech',
        );
        const pendingOutput = await this.createWorkflowOutputIngredient({
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

        await this.metadataService?.patch(
          pendingOutput.metadataId,
          new MetadataEntity({
            ...result.uploadResult,
            duration: result.duration,
            result: result.audioUrl,
          }),
        );
        await this.ingredientsService?.patch(
          pendingOutput.ingredientId,
          new IngredientEntity({
            status: IngredientStatus.GENERATED,
          }),
        );

        return {
          audioUrl: this.buildMusicIngredientUrl(pendingOutput.ingredientId),
          duration: result.duration,
          id: pendingOutput.ingredientId,
          status: IngredientStatus.GENERATED,
        };
      });

      this.loggerService.log(
        `${this.logContext} text-to-speech executor wired with ElevenLabs`,
      );
    }

    this.engine.registerExecutor(
      ttsExecutor.nodeType,
      this.wrapEngineExecutor(ttsExecutor),
    );
  }

  /**
   * Registers the reframe executor with Replicate (Luma) as the backend provider.
   */
  private registerReframeExecutor(): void {
    const reframeExecutor = createReframeExecutor();

    if (this.replicateService && this.metadataService) {
      const replicateService = this.replicateService;

      reframeExecutor.setResolver(async (mediaUrl, params, context, node) => {
        const outputCategory = this.resolveMediaOutputCategory(mediaUrl);
        const isVideo = outputCategory === IngredientCategory.VIDEO;
        const model =
          outputCategory === IngredientCategory.VIDEO
            ? MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO
            : MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE;
        const inputKey = isVideo ? 'video' : 'image';
        const parentIngredientId = this.extractIngredientId(mediaUrl);
        const brandId = await this.resolveBrandIdFromInputOrFail(
          this.readConfigString(node.config, 'brandId'),
          mediaUrl,
          'reframe',
        );
        const pendingOutput = await this.createWorkflowOutputIngredient({
          brandId,
          category: outputCategory,
          extension:
            outputCategory === IngredientCategory.VIDEO
              ? MetadataExtension.MP4
              : MetadataExtension.JPG,
          model,
          organizationId: context.organizationId,
          parentIngredientId,
          transformations: [TransformationCategory.REFRAMED],
          userId: context.userId,
        });

        const predictionId = await replicateService.runModel(model, {
          [inputKey]: mediaUrl,
          aspect_ratio: params.targetAspectRatio,
        });

        await this.metadataService?.patch(
          pendingOutput.metadataId,
          new MetadataEntity({
            externalId: predictionId,
            result: this.buildMediaIngredientUrl(
              pendingOutput.ingredientId,
              outputCategory,
            ),
          }),
        );

        return {
          format:
            outputCategory === IngredientCategory.VIDEO ? 'video' : 'image',
          id: pendingOutput.ingredientId,
          mediaUrl: this.buildMediaIngredientUrl(
            pendingOutput.ingredientId,
            outputCategory,
          ),
          status: IngredientStatus.PROCESSING,
          targetAspectRatio: params.targetAspectRatio,
        };
      });

      this.loggerService.log(
        `${this.logContext} reframe executor wired with Replicate (Luma)`,
      );
    }

    this.engine.registerExecutor(
      reframeExecutor.nodeType,
      this.wrapEngineExecutor(reframeExecutor),
    );
  }

  /**
   * Registers the upscale executor with Replicate (Topaz) as the backend provider.
   */
  private registerUpscaleExecutor(): void {
    const upscaleExecutor = createUpscaleExecutor();

    if (this.replicateService && this.metadataService) {
      const replicateService = this.replicateService;

      upscaleExecutor.setResolver(async (mediaUrl, params, context, node) => {
        const outputCategory = this.resolveMediaOutputCategory(mediaUrl);
        const isVideo = outputCategory === IngredientCategory.VIDEO;
        const model = isVideo
          ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
          : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE;
        const inputKey = isVideo ? 'video' : 'image';
        const parentIngredientId = this.extractIngredientId(mediaUrl);
        const brandId = await this.resolveBrandIdFromInputOrFail(
          this.readConfigString(node.config, 'brandId'),
          mediaUrl,
          'upscale',
        );
        const pendingOutput = await this.createWorkflowOutputIngredient({
          brandId,
          category: outputCategory,
          extension: isVideo ? MetadataExtension.MP4 : MetadataExtension.JPG,
          model,
          organizationId: context.organizationId,
          parentIngredientId,
          transformations: [TransformationCategory.UPSCALED],
          userId: context.userId,
        });

        const input: Record<string, unknown> = {
          [inputKey]: mediaUrl,
        };

        if (!isVideo) {
          input.upscale_factor = params.scale;
        }

        const predictionId = await replicateService.runModel(model, input);

        await this.metadataService?.patch(
          pendingOutput.metadataId,
          new MetadataEntity({
            externalId: predictionId,
            result: this.buildMediaIngredientUrl(
              pendingOutput.ingredientId,
              outputCategory,
            ),
          }),
        );

        return {
          id: pendingOutput.ingredientId,
          mediaUrl: this.buildMediaIngredientUrl(
            pendingOutput.ingredientId,
            outputCategory,
          ),
          model: params.model,
          scale: params.scale,
          status: IngredientStatus.PROCESSING,
        };
      });

      this.loggerService.log(
        `${this.logContext} upscale executor wired with Replicate (Topaz)`,
      );
    }

    this.engine.registerExecutor(
      upscaleExecutor.nodeType,
      this.wrapEngineExecutor(upscaleExecutor),
    );
  }

  /**
   * Registers a NestJS service method as a node executor.
   */
  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    this.engine.registerExecutor(nodeType, executor);
    this.loggerService.debug(
      `${this.logContext} registered executor for ${nodeType}`,
    );
  }

  /**
   * Converts a workflow Mongoose document to the engine-compatible format.
   */
  convertToExecutableWorkflow(
    workflowDoc: WorkflowDocumentShape,
  ): ExecutableWorkflow {
    const primaryBrandId =
      workflowDoc.brands && workflowDoc.brands.length > 0
        ? workflowDoc.brands[0]?.toString()
        : undefined;
    const nodes: ExecutableNode[] = (workflowDoc.nodes || []).map((node) => ({
      cachedOutput: (node as unknown as { cachedOutput?: unknown })
        .cachedOutput,
      config: this.withWorkflowBrandId(
        node.type,
        node.data?.config ||
          (node as unknown as { config?: Record<string, unknown> }).config ||
          {},
        primaryBrandId,
      ),
      id: node.id,
      inputs: (node as unknown as { inputs?: string[] }).inputs || [],
      isLocked: workflowDoc.lockedNodeIds?.includes(node.id) || false,
      label: node.data?.label || node.type,
      type: NODE_TYPE_TO_EXECUTOR[node.type] || node.type,
    }));

    const edges: ExecutableEdge[] = (workflowDoc.edges || []).map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }));

    return {
      edges,
      id:
        typeof workflowDoc._id === 'object' && workflowDoc._id
          ? workflowDoc._id.toString()
          : workflowDoc.id || '',
      lockedNodeIds: workflowDoc.lockedNodeIds || [],
      nodes,
      organizationId:
        typeof workflowDoc.organization === 'object' && workflowDoc.organization
          ? workflowDoc.organization.toString()
          : '',
      userId:
        typeof workflowDoc.user === 'object' && workflowDoc.user
          ? workflowDoc.user.toString()
          : '',
    };
  }

  private withWorkflowBrandId(
    nodeType: string,
    config: Record<string, unknown>,
    brandId: string | undefined,
  ): Record<string, unknown> {
    const canonicalNodeType = normalizeWorkflowNodeTypeToCanonical(nodeType);

    if (
      !brandId ||
      ![
        'ai-avatar-video',
        'ai-generate-image',
        'imageGen',
        'ai-text-to-speech',
        'effect-captions',
        'musicSource',
        'soundOverlay',
      ].includes(canonicalNodeType) ||
      typeof config.brandId === 'string'
    ) {
      return config;
    }

    return { ...config, brandId };
  }

  private extractMediaPreview(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    for (const key of ['imageUrl', 'videoUrl', 'mediaUrl', 'url']) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === 'string') {
        return candidate;
      }
    }

    return null;
  }

  private extractReviewGateInput(
    inputs: Map<string, unknown>,
    kind: 'caption' | 'media',
  ): unknown {
    const directValue = inputs.get(kind);
    if (directValue !== undefined) {
      return directValue;
    }

    for (const value of inputs.values()) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const record = value as Record<string, unknown>;
      if (kind === 'caption') {
        if (typeof record.caption === 'string') {
          return record.caption;
        }
        if (typeof record.text === 'string') {
          return record.text;
        }
        continue;
      }

      if (record.media !== undefined) {
        return record.media;
      }
      for (const key of ['imageUrl', 'videoUrl', 'mediaUrl', 'url']) {
        if (record[key] !== undefined) {
          return record[key];
        }
      }
    }

    return undefined;
  }

  applyRuntimeInputValues(
    workflowDoc: {
      inputVariables?: WorkflowInputVariable[];
      nodes?: WorkflowVisualNode[];
    },
    executableWorkflow: ExecutableWorkflow,
    inputValues: Record<string, unknown> = {},
  ): ExecutableWorkflow {
    const workflowInputNodes = new Map(
      (workflowDoc.nodes ?? [])
        .filter((node) => isWorkflowInputNodeType(node.type))
        .map((node) => [node.id, node]),
    );
    const requiredInputs = new Set(
      (workflowDoc.inputVariables ?? [])
        .filter((variable) => variable.required)
        .map((variable) => variable.key),
    );
    const lockedNodeIds = new Set(executableWorkflow.lockedNodeIds);

    const nodes = executableWorkflow.nodes
      .filter((node) => {
        if (!isWorkflowInputNodeType(node.type)) {
          return true;
        }

        const sourceNode = workflowInputNodes.get(node.id);
        const inputName =
          this.readConfigString(sourceNode?.data?.config, 'inputName') ??
          node.id;
        const defaultValue = sourceNode?.data?.config?.defaultValue;
        const value =
          inputValues[inputName] !== undefined
            ? inputValues[inputName]
            : defaultValue;

        if (value !== undefined) {
          node.cachedOutput = value;
          node.isLocked = true;
          lockedNodeIds.add(node.id);
          return true;
        }

        const isRequired =
          requiredInputs.has(inputName) ||
          sourceNode?.data?.config?.required === true;

        if (isRequired) {
          throw new Error(`Missing required workflow input: ${inputName}`);
        }

        return false;
      })
      .map((node) => ({ ...node }));

    const nodeIds = new Set(nodes.map((node) => node.id));

    return {
      ...executableWorkflow,
      edges: executableWorkflow.edges.filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
      ),
      lockedNodeIds: Array.from(lockedNodeIds).filter((nodeId) =>
        nodeIds.has(nodeId),
      ),
      nodes,
    };
  }

  private getRequiredStringInput(
    inputs: Map<string, unknown>,
    key: string,
  ): string {
    const value = inputs.get(key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    throw new Error(`Missing required input: ${key}`);
  }

  private getOptionalStringInput(
    inputs: Map<string, unknown>,
    key: string,
  ): string | undefined {
    const value = inputs.get(key);

    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private getAspectRatioConfig(value: unknown): '9:16' | '16:9' | '1:1' {
    if (value === '16:9' || value === '1:1') {
      return value;
    }

    return '9:16';
  }

  private getRequiredBrandId(node: ExecutableNode): string {
    const brandId = this.readConfigString(node.config, 'brandId');
    if (!brandId) {
      throw new Error(`${node.type} requires a brandId in node config`);
    }

    return brandId;
  }

  private getVideoResultInput(
    inputs: Map<string, unknown>,
    key: string,
  ): unknown {
    if (!inputs.has(key)) {
      throw new Error(`Missing required input: ${key}`);
    }

    return inputs.get(key);
  }

  private getOptionalNumberConfig(
    config: Record<string, unknown>,
    key: string,
    fallback: number,
  ): number {
    const value = config[key];
    return typeof value === 'number' ? value : fallback;
  }

  private async createWorkflowOutputIngredient(args: {
    brandId: string;
    category: IngredientCategory;
    extension: MetadataExtension;
    organizationId: string;
    userId: string;
    model?: string;
    parentIngredientId?: string;
    references?: Array<string | undefined>;
    transformations?: TransformationCategory[];
    externalId?: string | null;
  }): Promise<{ ingredientId: string; metadataId: string }> {
    if (
      !this.sharedService ||
      !this.metadataService ||
      !this.ingredientsService
    ) {
      throw new Error(
        'Workflow output persistence dependencies are not available',
      );
    }

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocumentsInternal({
        brand: new Types.ObjectId(args.brandId),
        category: args.category,
        extension: args.extension,
        model: args.model,
        organization: new Types.ObjectId(args.organizationId),
        parent:
          args.parentIngredientId &&
          Types.ObjectId.isValid(args.parentIngredientId)
            ? new Types.ObjectId(args.parentIngredientId)
            : undefined,
        references: (args.references ?? [])
          .filter(
            (reference): reference is string =>
              typeof reference === 'string' &&
              Types.ObjectId.isValid(reference),
          )
          .map((reference) => new Types.ObjectId(reference)),
        status: IngredientStatus.PROCESSING,
        user: new Types.ObjectId(args.userId),
      });

    const ingredientId = ingredientData._id.toString();
    const metadataId = metadataData._id.toString();

    if (args.externalId) {
      await this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          externalId: args.externalId,
        }),
      );
    }

    if (args.transformations && args.transformations.length > 0) {
      await this.ingredientsService.patch(
        ingredientId,
        new IngredientEntity({
          transformations: args.transformations,
        }),
      );
    }

    return { ingredientId, metadataId };
  }

  private async resolveBrandIdFromConfigOrFail(
    configuredBrandId: unknown,
    nodeType: string,
  ): Promise<string> {
    if (typeof configuredBrandId === 'string' && configuredBrandId.length > 0) {
      return configuredBrandId;
    }

    throw new Error(`${nodeType} requires a brandId in node config`);
  }

  private async resolveBrandIdFromInputOrFail(
    configuredBrandId: string | undefined,
    source: unknown,
    nodeType: string,
  ): Promise<string> {
    if (configuredBrandId) {
      return configuredBrandId;
    }

    const sourceIngredientId = this.extractIngredientId(source);
    if (sourceIngredientId && this.ingredientsService) {
      const sourceIngredient = await this.ingredientsService.findOne({
        _id: new Types.ObjectId(sourceIngredientId),
        isDeleted: false,
      });
      const sourceBrandId =
        this.getDocumentId(
          (sourceIngredient as unknown as { brand?: unknown })?.brand,
        ) ??
        (
          sourceIngredient as unknown as { brand?: { toString(): string } }
        )?.brand?.toString();

      if (sourceBrandId) {
        return sourceBrandId;
      }
    }

    throw new Error(
      `${nodeType} requires a brandId or source ingredient brand`,
    );
  }

  private resolveMediaOutputCategory(mediaValue: unknown): IngredientCategory {
    const mediaUrl =
      typeof mediaValue === 'string'
        ? mediaValue
        : (this.extractMediaUrl(mediaValue) ?? '');

    if (
      mediaUrl.includes('/videos/') ||
      mediaUrl.includes('.mp4') ||
      mediaUrl.includes('.mov') ||
      mediaUrl.includes('.webm')
    ) {
      return IngredientCategory.VIDEO;
    }

    return IngredientCategory.IMAGE;
  }

  private extractIngredientId(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const match = value.match(
        /\/(?:images|videos|musics|audios|avatars)\/([a-f\d]{24})(?:[/?#]|$)/i,
      );
      return match?.[1];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string') {
        return record.id;
      }

      const nestedVideo = record.video;
      if (nestedVideo && typeof nestedVideo === 'object') {
        const nestedRecord = nestedVideo as Record<string, unknown>;
        if (typeof nestedRecord.id === 'string') {
          return nestedRecord.id;
        }
      }

      const nestedMusic = record.music;
      if (nestedMusic && typeof nestedMusic === 'object') {
        const nestedRecord = nestedMusic as Record<string, unknown>;
        if (typeof nestedRecord.id === 'string') {
          return nestedRecord.id;
        }
      }
    }

    return undefined;
  }

  private extractMusicIngredientId(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.musicIngredientId === 'string') {
        return record.musicIngredientId;
      }
    }

    return undefined;
  }

  private resolveConfiguredMediaInput(
    node: ExecutableNode,
    defaultCategory: 'image' | 'video',
  ): string {
    const source = this.readConfigString(node.config, 'source') ?? 'library';
    const resolvedUrl =
      this.readConfigString(node.config, 'resolvedUrl') ??
      (source === 'url'
        ? this.readConfigString(node.config, 'url')
        : this.readConfigString(node.config, 'selectedResolvedUrl'));

    if (resolvedUrl) {
      return resolvedUrl;
    }

    const itemId = this.readConfigString(node.config, 'itemId');
    if (!itemId) {
      throw new Error(`${node.type} requires a selected media URL or itemId`);
    }

    const itemCategory =
      this.readConfigString(node.config, 'itemCategory') ?? defaultCategory;

    return this.buildMediaItemUrl(itemId, itemCategory, source);
  }

  private buildMusicIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/musics/${ingredientId}`;
  }

  private buildMediaIngredientUrl(
    ingredientId: string,
    category: IngredientCategory,
  ): string {
    if (category === IngredientCategory.VIDEO) {
      return this.buildVideoIngredientUrl(ingredientId);
    }

    return this.buildImageIngredientUrl(ingredientId);
  }

  private buildImageIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/images/${ingredientId}`;
  }

  private buildVideoIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`;
  }

  private buildLogoAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/logos/${assetId}`;
  }

  private buildBannerAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/banners/${assetId}`;
  }

  private buildReferenceAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/references/${assetId}`;
  }

  private buildMediaItemUrl(
    itemId: string,
    itemCategory: string,
    source: string,
  ): string {
    if (source === 'brand-references' || itemCategory === 'reference') {
      return this.buildReferenceAssetUrl(itemId);
    }

    if (itemCategory === 'video') {
      return this.buildVideoIngredientUrl(itemId);
    }

    return this.buildImageIngredientUrl(itemId);
  }

  private getRequiredJobOutputPath(result: unknown): string {
    if (result && typeof result === 'object') {
      const outputPath = (result as Record<string, unknown>).outputPath;

      if (typeof outputPath === 'string' && outputPath.length > 0) {
        return outputPath;
      }
    }

    throw new Error('Caption job completed without an outputPath');
  }

  private getDocumentId(document: unknown): string | undefined {
    if (!document || typeof document !== 'object') {
      return undefined;
    }

    const id = (document as { _id?: { toString(): string } | string })._id;
    if (typeof id === 'string') {
      return id;
    }

    if (id && typeof id === 'object' && 'toString' in id) {
      return id.toString();
    }

    return undefined;
  }

  private extractMediaUrl(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const candidates = [
      record.mediaUrl,
      record.imageUrl,
      record.videoUrl,
      record.audioUrl,
      (record.video as Record<string, unknown> | undefined)?.videoUrl,
    ];

    const firstUrl = candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.length > 0,
    );

    return firstUrl;
  }

  private readConfigString(
    config: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = config?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private buildPostLabel(description: string): string {
    const normalized = description.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 60) {
      return normalized;
    }

    return `${normalized.slice(0, 57).trimEnd()}...`;
  }

  /**
   * Converts step-based workflows to node/edge format.
   */
  convertStepsToExecutableWorkflow(
    workflowId: string,
    steps: WorkflowStep[],
    userId: string,
    organizationId: string,
  ): ExecutableWorkflow {
    const nodes: ExecutableNode[] = steps.map((step) => ({
      config: step.config || {},
      id: step.id,
      inputs: [],
      label: step.label,
      type: (step as unknown as { type?: string }).type || '',
    }));

    // Build edges from dependsOn relationships
    const edges: ExecutableEdge[] = [];
    for (const step of steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const depId of step.dependsOn) {
          edges.push({
            id: `${depId}-${step.id}`,
            source: depId,
            target: step.id,
          });
        }
      }
    }

    return {
      edges,
      id: workflowId,
      lockedNodeIds: [],
      nodes,
      organizationId,
      userId,
    };
  }

  /**
   * Executes a workflow using the workflow engine.
   * Supports both full and partial execution via options.nodeIds.
   */
  async executeWorkflow(
    workflow: ExecutableWorkflow,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    this.loggerService.log(`${this.logContext} executing workflow`, {
      nodeIds: options.nodeIds,
      workflowId: workflow.id,
    });

    const result = await this.engine.execute(workflow, options);

    this.loggerService.log(`${this.logContext} workflow execution completed`, {
      completedAt: result.completedAt,
      status: result.status,
      totalCreditsUsed: result.totalCreditsUsed,
      workflowId: workflow.id,
    });

    return result;
  }

  /**
   * Resumes a failed workflow execution from the failure point.
   */
  resumeWorkflow(
    workflow: ExecutableWorkflow,
    previousRunResult: ExecutionRunResult,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    this.loggerService.log(`${this.logContext} resuming workflow`, {
      workflowId: workflow.id,
    });

    return this.engine.resume(workflow, previousRunResult, options);
  }

  /**
   * Estimates credits for executing the given nodes.
   */
  estimateCredits(nodes: ExecutableNode[]): number {
    return this.engine.estimateCredits(nodes);
  }
}
