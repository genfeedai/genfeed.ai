import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AgentEndpointInvoker } from '@api/services/agent-generation-gateway/agent-endpoint-invoker.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ActivitySource, MemberRole, ModelCategory } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer, VoiceSerializer } from '@genfeedai/serializers';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateMusicDto } from '@server/collections/musics/dto/create-music.dto';
import { CreateAvatarVideoDto } from '@server/collections/videos/dto/create-avatar-video.dto';
import { CreateVideoDto } from '@server/collections/videos/dto/create-video.dto';
import { AvatarVideoGenerationService } from '@server/collections/videos/services/avatar-video-generation.service';
import { VideosService } from '@server/collections/videos/services/videos.service';
import { GenerateVoiceDto } from '@server/collections/voices/dto/generate-voice.dto';
import { VoiceGenerationService } from '@server/collections/voices/services/voice-generation.service';
import type {
  AgentGenerationInput,
  AgentGenerationResourceInput,
  IAgentGenerationGateway,
} from '@server/services/agent-orchestrator/gateway/agent-generation-gateway.interface';

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
  constructor(
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly imageReframeService: ImageReframeService,
    private readonly imageUpscaleService: ImageUpscaleService,
    private readonly invoker: AgentEndpointInvoker,
    private readonly musicGenerationService: MusicGenerationService,
    private readonly videoGenerationService: VideoGenerationService,
    private readonly videosService: VideosService,
    private readonly voiceGenerationService: VoiceGenerationService,
  ) {}

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
}
