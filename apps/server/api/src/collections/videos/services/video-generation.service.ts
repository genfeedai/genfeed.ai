import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
} from '@api/collections/models/utils/model-key.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { ConfigService } from '@api/config/config.service';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import {
  isImageToVideoRequest,
  resolveGenerationDefaultModel,
} from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PricingType,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type PromptInput = Record<string, unknown> & {
  prompt?: string;
  resolution?: string;
};

/**
 * Parameters passed to the single provider-dispatch helper. The same shape is
 * reused for the first output and every additional output, so provider routing
 * lives in exactly one place.
 */
interface DispatchVideoGenerationParams {
  duration?: number;
  height: number;
  imageUrl?: string;
  model: string;
  prompt: string;
  promptParams: Record<string, unknown>;
  width: number;
}

interface CreateVideoPlaceholderActivityParams {
  brandId: string;
  authProviderUserId: string;
  ingredientId: string;
  model: string;
  organization: string;
  user: string;
}

/**
 * Owns the full video-generation workflow extracted out of `VideosController`.
 *
 * The controller keeps the HTTP surface (decorators, guards, interceptors) and
 * delegates the request body to {@link generateVideo}. This service resolves the
 * model, performs deferred credit math, builds prompts, persists placeholder
 * documents, fans out to the correct external provider, deducts credits, emits
 * activity/websocket events, links bookmarks, kicks off background music
 * orchestration, and optionally polls for completion.
 */
@Injectable()
export class VideoGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly activitiesService: ActivitiesService,
    private readonly brandsService: BrandsService,
    private readonly assetsService: AssetsService,
    private readonly bookmarksService: BookmarksService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly falService: FalService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly ingredientsService: IngredientsService,
    private readonly pollingService: PollingService,
    private readonly klingAIService: KlingAIService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly modelsService: ModelsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly videoMusicOrchestrationService: VideoMusicOrchestrationService,
    private readonly videosService: VideosService,
    private readonly cacheService: CacheService,
    private readonly routerService: RouterService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async generateVideo(
    user: User,
    createVideoDto: CreateVideoDto,
    request: ExpressRequest,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    if (!createVideoDto.prompt && !createVideoDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const brandId = createVideoDto.brand || publicMetadata.brand;

    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Brand not found',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );

    const referenceIds: string[] = Array.isArray(createVideoDto.references)
      ? createVideoDto.references.map((id) => id.toString())
      : [];

    const model = await this.resolveVideoModel(
      createVideoDto,
      brand,
      organizationSettings,
      referenceIds,
    );

    // Validate resolved model against org (catches default-resolution bypassing ModelsGuard)
    if (request.context?.organizationId) {
      const authenticatedOrgId = request.context.organizationId;
      await this.modelRegistrationService.validateModelForOrg(
        model,
        authenticatedOrgId,
      );
    }

    await this.ensureDeferredCredits(
      createVideoDto,
      model,
      publicMetadata.organization,
      request,
    );

    const brandPromptBranding = buildPromptBrandingFromBrand(brand);

    const width = createVideoDto.width || 1920;
    const height = createVideoDto.height || 1080;

    let promptText: string = createVideoDto.text || '';

    const referenceImageUrls: string[] = await buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
      referenceIds,
    });

    // Build endFrame URL for video interpolation
    let endFrameUrl: string | undefined;
    if (createVideoDto.endFrame) {
      const endFrameUrls = await buildReferenceImageUrls({
        assetsService: this.assetsService,
        configService: this.configService,
        ingredientsService: this.ingredientsService,
        loggerService: this.loggerService,
        referenceIds: [createVideoDto.endFrame],
      });
      endFrameUrl = endFrameUrls[0];
    }

    if (createVideoDto.prompt) {
      const prompt = await this.promptsService.findOne({
        _id: createVideoDto.prompt.toString(),
        isDeleted: false,
      });

      if (prompt?._id) {
        promptText = prompt?.enhanced || prompt?.original || '';
      }
    }

    // First build prompt to get template info
    const {
      input: promptParams,
      templateUsed,
      templateVersion,
    } = await this.promptBuilderService.buildPrompt(
      model,
      {
        audioUrl: createVideoDto.audioUrl,
        blacklist: createVideoDto.blacklist,
        brand: {
          description: brand.description ?? undefined,
          label: brand.label ?? 'Brand',
          primaryColor: brand.primaryColor ?? undefined,
          secondaryColor: brand.secondaryColor ?? undefined,
          text: brand.text ?? undefined,
        },
        branding: brandPromptBranding,
        brandingMode: createVideoDto.brandingMode,
        camera: createVideoDto.camera,
        cameraMovement: createVideoDto.cameraMovement,
        duration: createVideoDto.duration,
        endFrame: endFrameUrl,
        fontFamily: createVideoDto.fontFamily,
        height,
        isAudioEnabled: createVideoDto.isAudioEnabled,
        isBrandingEnabled: createVideoDto.isBrandingEnabled,
        lens: createVideoDto.lens,
        lighting: createVideoDto.lighting,
        // Use model's category from DB (set by ModelsGuard), fallback to VIDEO
        modelCategory:
          ((request as unknown as { selectedModel?: { category?: string } })
            .selectedModel?.category as ModelCategory) || ModelCategory.VIDEO,
        mood: createVideoDto.mood,
        outputs: createVideoDto.outputs,
        prompt: promptText,
        promptTemplate: createVideoDto.promptTemplate,
        references: referenceImageUrls,
        resolution: createVideoDto.resolution,
        scene: createVideoDto.scene,
        seed: createVideoDto.seed,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        style: createVideoDto.style,
        tags: createVideoDto.tags?.map((tag) => tag.toString()),
        useTemplate: createVideoDto.useTemplate,
        width,
      },
      publicMetadata.organization,
    );
    const promptInput = promptParams as PromptInput;

    const promptData = await this.promptsService.create(
      new PromptEntity({
        blacklists: createVideoDto.blacklist,
        brand: publicMetadata.brand,
        camera: createVideoDto.camera,
        category: PromptCategory.MODELS_PROMPT_VIDEO,
        mood: createVideoDto.mood,
        organization: publicMetadata.organization,
        original: promptText,
        scene: createVideoDto.scene,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        status: PromptStatus.PROCESSING,
        style: createVideoDto.style,
        user: publicMetadata.user,
      }),
    );

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createVideoDto,
        bookmark: createVideoDto.bookmark
          ? (createVideoDto.bookmark as string)
          : undefined,
        brand: brand._id,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VIDEO,
        ),
        extension: MetadataExtension.MP4,
        height,
        model,
        organization: brand.organization,
        prompt: promptData._id,

        // Template tracking
        promptTemplate: templateUsed,
        references:
          referenceIds.length > 0 ? referenceIds.map((id) => id) : undefined,
        status: IngredientStatus.PROCESSING,
        style: createVideoDto.style === '' ? null : createVideoDto.style,
        templateVersion: templateVersion,
        width,
      });

    // Create activity + websocket update for video generation start
    await this.createVideoPlaceholderActivity({
      brandId: brand._id,
      authProviderUserId: user.id,
      ingredientId: ingredientData._id,
      model,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    const websocketUrl = WebSocketPaths.video(ingredientData._id);
    const outputs = createVideoDto.outputs || 1;

    this.loggerService.debug('Video generation request received', {
      model,
      outputs,
      rawOutputs: createVideoDto.outputs,
    });

    // Track all placeholder ingredient IDs
    const pendingIngredientIds: string[] = [ingredientData._id.toString()];

    try {
      // When generation is triggered, deduct credits
      const generationId: string | null = await this.dispatchVideoGeneration({
        duration: createVideoDto.duration,
        height,
        imageUrl: referenceImageUrls[0],
        model,
        prompt: promptInput.prompt || '',
        promptParams,
        width,
      });

      if (generationId) {
        // Deduct credits after successful generation trigger
        // Credits were already verified by CreditsGuard before processing started
        const modelData = await this.modelsService.findOne({ key: model });
        let creditsToDeduct = modelData?.cost || 0;

        // Multiply credits by resolution multiplier (high/1080p = 2x, standard/720p = 1x)
        if (
          promptInput.resolution === 'high' ||
          promptInput.resolution === '1080p'
        ) {
          creditsToDeduct *= 2;
        }

        // Multiply credits by outputs for multi-output requests
        if (outputs > 1) {
          creditsToDeduct *= outputs;
        }

        if (creditsToDeduct > 0) {
          // Build description with resolution and outputs info
          let resolutionText = '';
          if (
            promptInput.resolution === 'high' ||
            promptInput.resolution === '1080p'
          ) {
            resolutionText = ' (high resolution)';
          } else if (
            promptInput.resolution === 'standard' ||
            promptInput.resolution === '720p'
          ) {
            resolutionText = ' (standard resolution)';
          }
          const outputsText = outputs > 1 ? ` (${outputs} outputs)` : '';
          const description = `Video generation - ${model}${resolutionText}${outputsText}`;

          await this.creditsUtilsService.deductCreditsFromOrganization(
            publicMetadata.organization,
            publicMetadata.user,
            creditsToDeduct,
            description,
            ActivitySource.VIDEO_GENERATION,
          );

          this.loggerService.log(
            'Credits deducted after video generation triggered',
            {
              credits: creditsToDeduct,
              generationId,
              model,
              organizationId: publicMetadata.organization,
              outputs,
              resolution: promptInput.resolution || undefined,
              userId: publicMetadata.user,
            },
          );
        }

        // Check if model supports batch generation (single API call with multiple outputs)
        const modelCapability = MODEL_OUTPUT_CAPABILITIES[model];
        const isBatchSupported = modelCapability?.isBatchSupported ?? false;

        // Handle multiple outputs differently for batch-capable models vs others
        if (isBatchSupported && outputs > 1) {
          // Batch-capable models (trained models): single API call with multiple outputs, multiple results in one generation
          // First output uses indexed externalId
          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: `${generationId}_0`,
            }),
          );

          // Create additional placeholder documents for remaining outputs
          // PERFORMANCE: Create documents in parallel for better performance
          const additionalDocuments = await Promise.all(
            Array.from({ length: outputs - 1 }, () => {
              return this.sharedService.saveDocuments(user, {
                ...createVideoDto,
                brand: brand._id,
                category: CategoryPrismaUtil.toIngredientCategory(
                  IngredientCategory.VIDEO,
                ),
                extension: MetadataExtension.MP4,
                height,
                model,
                organization: brand.organization,
                prompt: promptData._id,
                references:
                  referenceIds.length > 0
                    ? referenceIds.map((id) => id)
                    : undefined,
                status: IngredientStatus.PROCESSING,
                style:
                  createVideoDto.style === '' ? null : createVideoDto.style,
                width,
              });
            }),
          );

          // Add all ingredient IDs to pending list
          pendingIngredientIds.push(
            ...additionalDocuments.map(({ ingredientData }) =>
              ingredientData._id.toString(),
            ),
          );

          // Create activities for each additional placeholder (batch model path)
          await Promise.all(
            additionalDocuments.map(({ ingredientData: addIngredient }) =>
              this.createVideoPlaceholderActivity({
                brandId: brand._id,
                authProviderUserId: user.id,
                ingredientId: addIngredient._id,
                model,
                organization: publicMetadata.organization,
                user: publicMetadata.user,
              }),
            ),
          );

          this.loggerService.log(
            'Created multiple placeholders for batch-capable model multi-output',
            {
              generationId,
              isBatchSupported: true,
              model,
              outputs,
              pendingIngredientIds,
            },
          );
        } else if (outputs > 1) {
          // Non-batch models (VEO, Sora, KlingAI, etc.): make multiple separate API calls
          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );

          // Make additional API calls for remaining outputs
          // NOTE: This loop must remain sequential because each iteration needs
          // a unique generationId from the external API call
          for (let i = 1; i < outputs; i++) {
            const {
              metadataData: additionalMetadata,
              ingredientData: additionalIngredient,
            } = await this.sharedService.saveDocuments(user, {
              ...createVideoDto,
              brand: brand._id,
              category: CategoryPrismaUtil.toIngredientCategory(
                IngredientCategory.VIDEO,
              ),
              extension: MetadataExtension.MP4,
              height,
              model,
              organization: brand.organization,
              prompt: promptData._id,
              references:
                referenceIds.length > 0
                  ? referenceIds.map((id) => id)
                  : undefined,
              status: IngredientStatus.PROCESSING,
              style: createVideoDto.style === '' ? null : createVideoDto.style,
              width,
            });

            // Make separate API call for each output based on model
            const additionalGenerationId: string | null =
              await this.dispatchVideoGeneration({
                duration: createVideoDto.duration,
                height,
                imageUrl: referenceImageUrls[0],
                model,
                prompt: promptInput.prompt || '',
                promptParams,
                width,
              });

            // Parallelize the patch operations
            await Promise.all([
              this.metadataService.patch(
                additionalMetadata._id,
                new MetadataEntity({
                  externalId: additionalGenerationId || '',
                }),
              ),
              this.videosService.patch(additionalIngredient._id, {
                prompt: promptData._id,
              }),
            ]);

            pendingIngredientIds.push(additionalIngredient._id.toString());

            // Create activity for this additional output (non-batch path)
            await this.createVideoPlaceholderActivity({
              brandId: brand._id,
              authProviderUserId: user.id,
              ingredientId: additionalIngredient._id,
              model,
              organization: publicMetadata.organization,
              user: publicMetadata.user,
            });
          }

          this.loggerService.log(
            'Created multiple API calls for non-batch model multi-output',
            {
              isBatchSupported: false,
              model,
              outputs,
              pendingIngredientIds,
            },
          );
        } else {
          // Single output - use original external ID
          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );
        }
      } else {
        // Clean up all placeholders on failure
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientData._id,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
          {
            brand: brand._id.toString(),
            key: ActivityKey.VIDEO_FAILED,
            organization: publicMetadata.organization,
            source: ActivitySource.VIDEO_GENERATION,
            user: publicMetadata.user,
            value: JSON.stringify({
              error: 'Generation failed to start',
              ingredientId: ingredientData._id.toString(),
            }),
          },
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName} create failed`, error);

      // Clean up all placeholders on error - PERFORMANCE: Use Promise.all for parallel execution
      await Promise.all(
        pendingIngredientIds.map((pendingId) => {
          const wsUrl = WebSocketPaths.video(pendingId);
          return this.failedGenerationService.handleFailedVideoGeneration(
            this.videosService,
            pendingId,
            wsUrl,
            user.id,
            getUserRoomName(user.id),
            {
              brand: brand._id.toString(),
              key: ActivityKey.VIDEO_FAILED,
              organization: publicMetadata.organization,
              source: ActivitySource.VIDEO_GENERATION,
              user: publicMetadata.user,
              value: JSON.stringify({
                error: (error as Error)?.message || 'Generation failed',
                ingredientId: pendingId,
              }),
            },
          );
        }),
      );

      // Re-throw the error so it can be handled by exception filters and returned to frontend
      throw error;
    }

    // Link video to bookmark if provided
    if (createVideoDto.bookmark) {
      try {
        await this.bookmarksService.addGeneratedIngredient(
          createVideoDto.bookmark,
          ingredientData._id,
        );
        this.loggerService.log('Linked video to bookmark', {
          bookmarkId: createVideoDto.bookmark,
          videoId: ingredientData._id,
        });
      } catch (error: unknown) {
        this.loggerService.warn(
          'Failed to link video to bookmark',
          error as Error,
        );
        // Don't fail the video creation if bookmark linking fails
      }
    }

    // Invalidate cached video listings so placeholders appear immediately
    await this.cacheService.invalidateByTags(['videos']);

    // Handle background music orchestration (runs in background)
    if (createVideoDto.backgroundMusic) {
      const orchestrationContext = {
        brandId: brand._id.toString(),
        authProviderUserId: user.id,
        organizationId: publicMetadata.organization,
        userId: publicMetadata.user,
      };

      // Start orchestration in background - don't await
      this.videoMusicOrchestrationService
        .orchestrateVideoWithMusic(
          ingredientData._id.toString(),
          createVideoDto.backgroundMusic,
          createVideoDto.duration || 10,
          createVideoDto.musicVolume ?? 30,
          createVideoDto.muteVideoAudio ?? false,
          orchestrationContext,
        )
        .then((mergedVideoId) => {
          this.loggerService.log('Video+music orchestration completed', {
            mergedVideoId,
            originalVideoId: ingredientData._id.toString(),
          });
        })
        .catch((error: unknown) => {
          this.loggerService.error('Video+music orchestration failed', {
            error: (error as Error)?.message || 'Unknown error',
            originalVideoId: ingredientData._id.toString(),
          });
        });
    }

    // Handle waitForCompletion if requested
    const waitForCompletion = createVideoDto.waitForCompletion === true;
    if (waitForCompletion) {
      try {
        // Wait for all outputs to complete
        const completedIngredients =
          await this.pollingService.waitForMultipleIngredientsCompletion(
            pendingIngredientIds,
            600000, // 10 minutes timeout for videos
            5000, // 5 seconds poll interval
            [
              PopulatePatterns.promptFull,
              PopulatePatterns.metadataFull,
              PopulatePatterns.userMinimal,
              PopulatePatterns.brandMinimal,
            ],
          );

        // Return the first completed video (or all if needed)
        return serializeSingle(
          request,
          VideoSerializer,
          completedIngredients[0],
        );
      } catch (error: unknown) {
        if ((error as Error).name === 'PollingTimeoutError') {
          // Return what we have even if timeout
          const ingredient = await this.videosService.findOne(
            { _id: ingredientData._id },
            [
              PopulatePatterns.promptFull,
              PopulatePatterns.metadataFull,
              PopulatePatterns.userMinimal,
              PopulatePatterns.brandMinimal,
            ],
          );

          if (ingredient) {
            throw new HttpException(
              {
                detail: `Video generation did not complete within 10 minutes. Current status: ${ingredient.status}`,
                title: 'Generation timeout',
              },
              HttpStatus.GATEWAY_TIMEOUT,
            );
          }
        }
        throw error;
      }
    }

    // Return all pending ingredient IDs
    return serializeSingle(request, VideoSerializer, {
      ...ingredientData,
      pendingIngredientIds,
    });
  }

  /**
   * Resolve the model for a video generation request.
   * Precedence: auto-select > user-provided > brand default > org default > system default.
   */
  private async resolveVideoModel(
    createVideoDto: CreateVideoDto,
    brand: {
      defaultImageToVideoModel?: unknown;
      defaultVideoModel?: unknown;
    },
    organizationSettings: {
      defaultImageToVideoModel?: unknown;
      defaultVideoModel?: unknown;
    } | null,
    referenceIds: string[],
  ): Promise<string> {
    if (createVideoDto.autoSelectModel) {
      // Auto model routing - let RouterService pick the best model
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.VIDEO,
        dimensions: {
          height: createVideoDto.height,
          width: createVideoDto.width,
        },
        duration: createVideoDto.duration,
        prioritize: createVideoDto.prioritize || 'balanced',
        prompt: createVideoDto.text || '',
        speech: createVideoDto.speech,
      });

      this.loggerService.log(
        'Auto model routing selected',
        recommendation.reason,
      );

      return recommendation.selectedModel as string;
    }

    // Manual selection: user-provided > brand default > system default
    return resolveGenerationDefaultModel<string>({
      brandDefault: (isImageToVideoRequest({
        endFrame: createVideoDto.endFrame,
        references: referenceIds,
      })
        ? brand.defaultImageToVideoModel
        : brand.defaultVideoModel) as string | undefined,
      explicit: createVideoDto.model as string | undefined,
      organizationDefault: (isImageToVideoRequest({
        endFrame: createVideoDto.endFrame,
        references: referenceIds,
      })
        ? organizationSettings?.defaultImageToVideoModel
        : organizationSettings?.defaultVideoModel) as string | undefined,
      systemDefault: (await this.routerService.getDefaultModel(
        ModelCategory.VIDEO,
      )) as string,
    });
  }

  /**
   * Run the deferred credit check (CreditsGuard defers it until the model is
   * resolved) and rewrite the request's credits config with the resolved amount.
   */
  private async ensureDeferredCredits(
    createVideoDto: CreateVideoDto,
    model: string,
    organization: string,
    request: ExpressRequest,
  ): Promise<void> {
    const reqWithCredits = request as unknown as {
      creditsConfig?: {
        deferred?: boolean;
        amount?: number;
        modelKey?: string;
      };
    };
    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    const resolvedModelDoc = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(model),
    });

    const vidWidth = createVideoDto.width || 1920;
    const vidHeight = createVideoDto.height || 1080;
    const vidDuration = createVideoDto.duration || 0;
    let requiredCredits: number;

    if (resolvedModelDoc) {
      requiredCredits = this.calculateDynamicVideoCost(
        resolvedModelDoc,
        vidWidth,
        vidHeight,
        vidDuration,
      );
    } else {
      requiredCredits = 5; // Fallback default cost
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organization,
        requiredCredits,
      );
    if (!hasCredits) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organization,
        );
      throw new HttpException(
        {
          detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
          title: 'Insufficient credits',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount: requiredCredits,
      deferred: false,
      modelKey: model,
    };
  }

  /**
   * Single source of truth for provider routing. Every video output — the first
   * and each additional one — flows through here, so FAL/Replicate/KlingAI
   * routing can never diverge between outputs of the same request.
   *
   * - `KLINGAI_V2` uses its own queue-backed service.
   * - Any `fal-ai/*` model (detected via {@link isFalDestination}) goes to FAL.
   * - Everything else falls through to Replicate.
   *
   * @returns the external generation id/url, or null when the provider declined.
   */
  private async dispatchVideoGeneration(
    params: DispatchVideoGenerationParams,
  ): Promise<string | null> {
    const { duration, height, imageUrl, model, prompt, promptParams, width } =
      params;

    if (model === MODEL_KEYS.KLINGAI_V2) {
      // KlingAI uses its own service for queue management
      return this.klingAIService.queueGenerateTextToVideo(prompt, {
        height,
        model,
        width,
      });
    }

    if (isFalDestination(model)) {
      const falResult = await this.falService.generateVideo(model, {
        prompt,
        ...(duration && { duration }),
        ...(imageUrl && { image_url: imageUrl }),
      });
      return falResult.url;
    }

    // All Replicate-based models (Google VEO, Imagen, Luma, Sora, etc.)
    return this.replicateService.generateTextToVideo(model, promptParams);
  }

  /**
   * Create the VIDEO_PROCESSING activity and emit the matching background-task
   * websocket update. Shared by the primary output and both multi-output paths.
   */
  private async createVideoPlaceholderActivity(
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
      activityId: activity._id.toString(),
      label: 'Video Generation',
      progress: 0,
      room: getUserRoomName(params.authProviderUserId),
      status: 'processing',
      taskId: params.ingredientId.toString(),
      userId: params.authProviderUserId,
    });
  }

  /**
   * Calculate dynamic video cost based on model pricing type.
   * Mirrors the CreditsGuard.calculateDynamicCost logic for video models.
   */
  private calculateDynamicVideoCost(
    model: {
      cost?: number;
      pricingType?: PricingType;
      costPerUnit?: number;
      minCost?: number;
    },
    width: number,
    height: number,
    duration: number,
  ): number {
    const pricingType = model.pricingType || PricingType.FLAT;
    let baseCost = model.cost || 0;

    if (
      pricingType === PricingType.PER_MEGAPIXEL &&
      width &&
      height &&
      model.costPerUnit
    ) {
      const megapixels = (width * height) / 1_000_000;
      baseCost = Math.ceil(megapixels * model.costPerUnit);
    } else if (
      pricingType === PricingType.PER_SECOND &&
      duration &&
      model.costPerUnit
    ) {
      baseCost = Math.ceil(duration * model.costPerUnit);
    }

    const minCost = model.minCost || 0;
    if (minCost > 0 && baseCost < minCost) {
      baseCost = minCost;
    }

    return baseCost;
  }
}
