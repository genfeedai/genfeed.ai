import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import {
  ArticleGenerationType,
  GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreateAvatarVideoDto } from '@api/collections/videos/dto/create-avatar-video.dto';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import {
  assertOrganizationCreditsAvailable,
  resolveTextModelMinimumCredits,
} from '@api/helpers/utils/credits/organization-credits-gate.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { AgentEndpointRequest } from '@api/services/agent-generation-gateway/agent-endpoint.interface';
import { AgentEndpointInvoker } from '@api/services/agent-generation-gateway/agent-endpoint-invoker.service';
import type {
  AgentGenerationInput,
  AgentGenerationResourceInput,
  IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  MemberRole,
  ModelCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  JsonApiResult,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  ArticleSerializer,
  IngredientSerializer,
  VoiceSerializer,
} from '@genfeedai/serializers';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

/** `@SetMetadata('roles', [...])` shared by the media creation endpoints. */
const GENERATION_ROLES: (string | MemberRole)[] = [
  'superadmin',
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.CREATOR,
];

/**
 * In-process entrypoint to the billable media generation endpoints.
 *
 * Each method is a descriptor mirroring one controller method's decorators
 * one-for-one; {@link AgentEndpointInvoker} owns the enforcement sequence. When
 * a controller's decorators change, change the matching descriptor here.
 */
@Injectable()
export class AgentGenerationGatewayService implements IAgentGenerationGateway {
  private static readonly ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly articlesService: ArticlesService,
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly imageReframeService: ImageReframeService,
    private readonly imageUpscaleService: ImageUpscaleService,
    private readonly invoker: AgentEndpointInvoker,
    private readonly modelsService: ModelsService,
    private readonly musicGenerationService: MusicGenerationService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly videoGenerationService: VideoGenerationService,
    private readonly videosService: VideosService,
    private readonly voiceGenerationService: VoiceGenerationService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /** Mirrors `ArticlesOperationsController.generateArticles` — `POST /v1/articles/generations`. */
  async generateArticle(input: AgentGenerationInput): Promise<JsonApiResult> {
    return this.invoker.invoke<GenerateArticlesDto, JsonApiResult>(
      {
        creditsConfig: {
          description: 'Article generation (text model bundle)',
          source: ActivitySource.ARTICLE_GENERATION,
        },
        dto: GenerateArticlesDto,
        handle: ({ dto, request, user }) =>
          this.handleGenerateArticles(dto, request, user),
        hasCreditsInterceptor: true,
        hasRolesGuard: true,
        originalUrl: '/v1/articles/generations',
        shouldDeferCreditsUntilModelResolution: true,
      },
      input,
    );
  }

  /**
   * Mirrors `ArticlesOperationsController.generateArticles`'s handler body
   * one-for-one. `request` here is the synthesized `AgentEndpointRequest`;
   * `creditsConfig` already carries the same `{amount, deferred, modelKey}`
   * shape the controller casts to `DeferredCreditsRequest` for, so no local
   * cast type is needed.
   */
  private async handleGenerateArticles(
    dto: GenerateArticlesDto,
    request: AgentEndpointRequest,
    user: User,
  ): Promise<JsonApiResult> {
    const brandId = dto.brandId || user.brandId;
    const generationType = dto.type || ArticleGenerationType.STANDARD;
    const isXArticle = generationType === ArticleGenerationType.X_ARTICLE;

    const orgSettings =
      await this.organizationSettingsService.ensureForOrganization(
        user.organizationId,
      );

    if (!orgSettings.isGenerateArticlesEnabled) {
      throw new ForbiddenException(
        'Article generation is not enabled for this organization',
      );
    }

    await this.assertGenerationModelOverrideSupported(dto.model);

    const modelConfig =
      await this.articlesService.resolveArticleCycleModelConfig(
        user.organizationId,
        dto.model,
      );
    const minimumRequiredCredits = (
      await Promise.all([
        resolveTextModelMinimumCredits(
          this.modelsService,
          modelConfig.generationModel,
        ),
        resolveTextModelMinimumCredits(
          this.modelsService,
          modelConfig.reviewModel,
        ),
        resolveTextModelMinimumCredits(
          this.modelsService,
          modelConfig.updateModel,
        ),
      ])
    ).reduce((sum, amount) => sum + amount, 0);

    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      user.organizationId,
      minimumRequiredCredits,
    );

    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId,
        key: ActivityKey.ARTICLE_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.ARTICLE_GENERATION,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          count: dto.count || 1,
          prompt: dto.prompt?.substring(0, 100),
          type: generationType,
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: isXArticle ? 'X Article Generation' : 'Article Generation',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: activity.id.toString(),
      userId: user.id,
    });

    try {
      const { articles, billedCredits } =
        await this.articlesService.generateArticles(
          dto,
          user.userId ?? user.id,
          user.organizationId,
          brandId,
        );

      this.settleDeferredArticleCredits(request, billedCredits);

      for (const article of articles) {
        await this.activitiesService.create(
          new ActivityEntity({
            brandId,
            entityId: article.id,
            entityModel: ActivityEntityModel.ARTICLE,
            key: ActivityKey.ARTICLE_GENERATED,
            organizationId: user.organizationId,
            source: ActivitySource.ARTICLE_GENERATION,
            userId: user.userId ?? user.id,
            value: article.id.toString(),
          }),
        );

        await this.websocketService.publishBackgroundTaskUpdate({
          activityId: activity.id.toString(),
          label: isXArticle ? 'X Article Generation' : 'Article Generation',
          progress: 100,
          resultId: article.id.toString(),
          room: getUserRoomName(user.id),
          status: 'completed',
          taskId: article.id.toString(),
          userId: user.id,
        });
      }

      if (isXArticle && articles[0]) {
        return serializeSingle(request, ArticleSerializer, articles[0]);
      }

      return serializeCollection(request, ArticleSerializer, {
        docs: articles,
      });
    } catch (error: unknown) {
      await this.recordArticleGenerationFailure(
        activity.id.toString(),
        error,
        isXArticle,
        user.id,
      );

      throw error;
    }
  }

  /** Mirrors `AvatarVideoController.createAvatarVideo` — `POST /v1/videos/avatar`. */
  async generateAvatarVideo(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<CreateAvatarVideoDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Avatar video generation',
          modelKey: MODEL_KEYS.HEYGEN_AVATAR,
          source: ActivitySource.VIDEO_GENERATION,
        },
        dto: CreateAvatarVideoDto,
        handle: async ({ dto, request, user }) => {
          const result =
            await this.avatarVideoGenerationService.generateAvatarVideo(
              {
                aspectRatio: dto.aspectRatio,
                audioUrl: dto.audioUrl,
                avatarId: dto.avatarId,
                clonedVoiceId: dto.clonedVoiceId,
                elevenlabsVoiceId: dto.elevenlabsVoiceId,
                heygenVoiceId: dto.heygenVoiceId,
                photoUrl: dto.photoUrl,
                text: dto.text ?? '',
                useIdentity: dto.useIdentity,
                voiceProvider: dto.voiceProvider,
              },
              {
                brandId: user.brandId,
                organizationId: user.organizationId,
                userId: user.userId ?? user.id,
              },
            );

          const ingredient = await this.videosService.findOne({
            id: result.ingredientId,
            organizationId: user.organizationId,
          });

          if (!ingredient) {
            throw new HttpException(
              {
                detail: `Video ${result.ingredientId} was not persisted`,
                title: 'Avatar video generation failed',
              },
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }

          return serializeSingle(request, IngredientSerializer, ingredient);
        },
        hasCreditsInterceptor: true,
        hasRolesGuard: false,
        originalUrl: '/v1/videos/avatar',
      },
      input,
    );
  }

  /** Mirrors `ImagesOperationsController.create` — `POST /v1/images`. */
  async generateImage(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<CreateImageDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Image generation',
          source: ActivitySource.IMAGE_GENERATION,
        },
        dto: CreateImageDto,
        handle: ({ dto, request, user }) =>
          this.imageGenerationService.generateImage(
            user,
            dto,
            request,
            input.onPlaceholderCreated,
          ),
        hasCreditsInterceptor: true,
        hasRolesGuard: true,
        modelValidation: { category: ModelCategory.IMAGE },
        originalUrl: '/v1/images',
        requiredRoles: GENERATION_ROLES,
        shouldDeferCreditsUntilModelResolution: true,
      },
      input,
    );
  }

  /** Mirrors `MusicsOperationsController.create` — `POST /v1/musics`. */
  async generateMusic(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<CreateMusicDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Music generation',
          source: ActivitySource.MUSIC_GENERATION,
        },
        dto: CreateMusicDto,
        handle: ({ dto, request, user }) =>
          this.musicGenerationService.generateMusic(user, dto, request),
        hasCreditsInterceptor: true,
        hasRolesGuard: true,
        modelValidation: { category: ModelCategory.MUSIC },
        originalUrl: '/v1/musics',
      },
      input,
    );
  }

  /** Mirrors `VideosController.create` — `POST /v1/videos`. */
  async generateVideo(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<CreateVideoDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Video generation',
          source: ActivitySource.VIDEO_GENERATION,
        },
        dto: CreateVideoDto,
        handle: ({ dto, request, user }) =>
          this.videoGenerationService.generateVideo(
            user,
            dto,
            request,
            input.onPlaceholderCreated,
          ),
        hasCreditsInterceptor: true,
        hasRolesGuard: true,
        modelValidation: { category: ModelCategory.VIDEO },
        originalUrl: '/v1/videos',
        requiredRoles: GENERATION_ROLES,
        shouldDeferCreditsUntilModelResolution: true,
      },
      input,
    );
  }

  /** Mirrors `VoicesOperationsController.generate` — `POST /v1/voices/generate`. */
  async generateVoice(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<GenerateVoiceDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Voice generation (TTS)',
          source: ActivitySource.VOICE_GENERATION,
        },
        dto: GenerateVoiceDto,
        handle: async ({ dto, request, user }) => {
          const voice = await this.voiceGenerationService.generate(user, dto);

          return serializeSingle(request, VoiceSerializer, voice);
        },
        hasCreditsInterceptor: true,
        hasRolesGuard: false,
        originalUrl: '/v1/voices/generate',
        shouldDeferCreditsUntilModelResolution: true,
      },
      input,
    );
  }

  /** Mirrors `ImagesReframeController.reframeImage` — `POST /v1/images/:imageId/reframe`. */
  async reframeImage(
    input: AgentGenerationResourceInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<CreateImageDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Image reframe',
          modelKey: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
          source: ActivitySource.IMAGE_REFRAME,
        },
        dto: CreateImageDto,
        handle: async ({ dto, request, user }) => {
          const reframedImage = await this.imageReframeService.reframeImage(
            request,
            input.resourceId,
            user,
            dto,
          );

          return serializeSingle(request, IngredientSerializer, reframedImage);
        },
        hasCreditsInterceptor: true,
        hasRolesGuard: false,
        modelValidation: { category: ModelCategory.IMAGE_EDIT },
        originalUrl: `/v1/images/${input.resourceId}/reframe`,
        params: { imageId: input.resourceId },
      },
      input,
    );
  }

  /** Mirrors `ImagesUpscaleController.upscaleImage` — `POST /v1/images/:imageId/upscale`. */
  async upscaleImage(
    input: AgentGenerationResourceInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<ImageEditDto, JsonApiSingleResponse>(
      {
        creditsConfig: {
          description: 'Image upscaling',
          modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
          source: ActivitySource.IMAGE_UPSCALE,
        },
        dto: ImageEditDto,
        handle: async ({ dto, request, user }) => {
          const upscaledImage = await this.imageUpscaleService.upscaleImage(
            request,
            input.resourceId,
            user,
            dto,
          );

          return serializeSingle(request, IngredientSerializer, upscaledImage);
        },
        hasCreditsInterceptor: true,
        hasRolesGuard: false,
        modelValidation: { category: ModelCategory.IMAGE_EDIT },
        originalUrl: `/v1/images/${input.resourceId}/upscale`,
        params: { imageId: input.resourceId },
      },
      input,
    );
  }

  /**
   * Gates the per-request generation model (`GenerateArticlesDto.model`)
   * before anything is generated. Mirrors
   * `ArticlesOperationsController.assertGenerationModelOverrideSupported`.
   */
  private async assertGenerationModelOverrideSupported(
    modelKey?: string,
  ): Promise<void> {
    if (!modelKey) {
      return;
    }

    const model = await this.modelsService.findOne({
      isActive: true,
      isDeleted: false,
      isLegacy: false,
      key: baseModelKey(modelKey),
    });

    if (model?.category === ModelCategory.TEXT) {
      return;
    }

    throw new HttpException(
      {
        detail: `Unknown text model for article generation: ${modelKey}`,
        title: 'Validation failed',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private async recordArticleGenerationFailure(
    activityId: string,
    error: unknown,
    isXArticle: boolean,
    userId: string,
  ): Promise<void> {
    const errorMessage =
      (error as Error)?.message || 'Article generation failed';

    await this.activitiesService.patch(activityId, {
      key: ActivityKey.ARTICLE_FAILED,
      value: JSON.stringify({
        error: errorMessage,
      }),
    });

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId,
      error: errorMessage,
      label: isXArticle ? 'X Article Generation' : 'Article Generation',
      room: getUserRoomName(userId),
      status: 'failed',
      taskId: activityId,
      userId,
    });
  }

  /**
   * Replaces the invoker's deferred placeholder with the amount the text
   * models actually billed. A no-op when the charge was never deferred.
   */
  private settleDeferredArticleCredits(
    request: AgentEndpointRequest,
    billedCredits: number,
  ): void {
    if (!request.creditsConfig?.deferred) {
      return;
    }

    request.creditsConfig = {
      ...request.creditsConfig,
      amount: billedCredits,
      deferred: false,
      maxOverdraftCredits:
        AgentGenerationGatewayService.ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }
}
