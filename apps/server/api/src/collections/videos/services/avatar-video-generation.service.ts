import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { type AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { type VoiceDocument } from '@api/collections/voices/schemas/voice.schema';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { ConfigService } from '@api/config/config.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivitySource,
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelKey,
  VoiceProvider,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

interface AvatarVideoGenerationContext {
  organizationId: string;
  userId: string;
  brandId?: string;
}

interface AvatarVideoGenerationParams {
  text: string;
  useIdentity?: boolean;
  photoUrl?: string;
  audioUrl?: string;
  clonedVoiceId?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  avatarId?: string;
  voiceProvider?: string;
  aspectRatio?: AvatarVideoAspectRatio;
}

interface AvatarVideoGenerationResult {
  ingredientId: string;
  externalId: string;
  status: 'processing';
}

interface ResolvedIdentity {
  audioUrl?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  photoIngredientId?: string;
  photoUrl?: string;
}

interface ResolvedAudioSource {
  audioDuration: number;
  audioUrl?: string;
  heygenVoiceId?: string;
}

@Injectable()
export class AvatarVideoGenerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly byokService: ByokService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly elevenlabsService: ElevenLabsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly fleetService: FleetService,
    private readonly heygenService: HeyGenService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly orgSettingsService: OrganizationSettingsService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly voicesService: VoicesService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async generateAvatarVideo(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
  ): Promise<AvatarVideoGenerationResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let ingredientId: string | null = null;

    try {
      const brand = await this.findBrandForContext(context);
      const resolvedIdentity = await this.resolveIdentityInputs(
        params,
        context,
        brand,
      );
      const photoUrl = await this.resolvePhotoUrl(
        params,
        context,
        resolvedIdentity.photoIngredientId,
        resolvedIdentity.photoUrl,
      );
      const { audioDuration, audioUrl, heygenVoiceId } =
        await this.resolveAudioSource(params, context, resolvedIdentity);

      const { ingredientData, metadataData } =
        await this.sharedService.saveDocumentsInternal({
          brand: new Types.ObjectId(brand._id),
          category: IngredientCategory.AVATAR,
          extension: MetadataExtension.MP4,
          model: ModelKey.HEYGEN_AVATAR,
          organization: new Types.ObjectId(context.organizationId),
          parent:
            resolvedIdentity.photoIngredientId != null
              ? new Types.ObjectId(resolvedIdentity.photoIngredientId)
              : undefined,
          status: IngredientStatus.PROCESSING,
          user: new Types.ObjectId(context.userId),
        });

      ingredientId = String(ingredientData._id);

      const heygenByokKey = await this.byokService.resolveApiKey(
        context.organizationId,
        ByokProvider.HEYGEN,
      );
      const externalId = await this.heygenService.generatePhotoAvatarVideo(
        ingredientId,
        photoUrl,
        {
          audioUrl,
          inputText: params.text,
          voiceId: heygenVoiceId,
        },
        context.organizationId,
        context.userId,
        heygenByokKey?.apiKey,
        params.aspectRatio ?? '9:16',
      );

      await this.metadataService.patch(
        metadataData._id,
        new MetadataEntity({
          duration: audioDuration > 0 ? audioDuration : undefined,
          externalId,
        }),
      );

      await this.creditsUtilsService.deductCreditsFromOrganization(
        context.organizationId,
        context.userId,
        1,
        `Avatar video generation - ${ModelKey.HEYGEN_AVATAR}`,
        ActivitySource.VIDEO_GENERATION,
      );

      await this.publishInitialStatus(ingredientId, context.userId);

      return {
        externalId,
        ingredientId,
        status: 'processing',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (ingredientId) {
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientId,
          WebSocketPaths.video(ingredientId),
          context.userId,
          `user-${context.userId}`,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'An error occurred while generating avatar video',
          title: 'Avatar video generation failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async resolveIdentityInputs(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
    brand: BrandDocument | null,
  ): Promise<ResolvedIdentity> {
    const resolved: ResolvedIdentity = {
      audioUrl: params.audioUrl,
      elevenlabsVoiceId: params.elevenlabsVoiceId,
      heygenVoiceId: params.heygenVoiceId,
      photoIngredientId: undefined,
      photoUrl: params.photoUrl,
    };

    if (
      params.clonedVoiceId &&
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId
    ) {
      const clonedVoice = await this.findVoiceById(
        params.clonedVoiceId,
        context.organizationId,
      );

      if (clonedVoice?.isCloned) {
        const resolvedClonedVoice = await this.resolveVoiceDocument(
          {
            ...clonedVoice,
            provider:
              params.voiceProvider != null
                ? (params.voiceProvider as VoiceProvider)
                : clonedVoice.provider,
          },
          params.text,
        );

        resolved.audioUrl = resolvedClonedVoice.audioUrl;
        resolved.elevenlabsVoiceId =
          resolvedClonedVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
        resolved.heygenVoiceId =
          resolvedClonedVoice.heygenVoiceId ?? resolved.heygenVoiceId;
      }
    }

    if (!params.useIdentity) {
      return resolved;
    }

    const organizationSettings = await this.orgSettingsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(context.organizationId),
    });
    const effectiveBrandAgentConfig = resolveEffectiveBrandAgentConfig({
      brand,
      organizationSettings,
    });
    const brandIdentityDefaults =
      effectiveBrandAgentConfig.identityDefaults.brand;
    const organizationIdentityDefaults =
      effectiveBrandAgentConfig.identityDefaults.organization;

    if (
      !resolved.photoUrl &&
      !resolved.photoIngredientId &&
      brandIdentityDefaults.defaultAvatarIngredientId
    ) {
      resolved.photoIngredientId = String(
        brandIdentityDefaults.defaultAvatarIngredientId,
      );
    }

    if (
      !resolved.photoUrl &&
      !resolved.photoIngredientId &&
      brandIdentityDefaults.defaultAvatarPhotoUrl
    ) {
      resolved.photoUrl = brandIdentityDefaults.defaultAvatarPhotoUrl;
    }

    if (
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      brandIdentityDefaults.defaultVoiceRef
    ) {
      const resolvedBrandDefaultVoice = await this.resolveSavedVoiceRef(
        brandIdentityDefaults.defaultVoiceRef,
        context.organizationId,
        params.text,
      );
      resolved.audioUrl = resolvedBrandDefaultVoice.audioUrl;
      resolved.elevenlabsVoiceId =
        resolvedBrandDefaultVoice.elevenlabsVoiceId ??
        resolved.elevenlabsVoiceId;
      resolved.heygenVoiceId =
        resolvedBrandDefaultVoice.heygenVoiceId ?? resolved.heygenVoiceId;
    }

    if (
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      brandIdentityDefaults.defaultVoiceId
    ) {
      const brandVoice = await this.findVoiceById(
        brandIdentityDefaults.defaultVoiceId.toString(),
        context.organizationId,
      );
      if (brandVoice) {
        const resolvedBrandVoice = await this.resolveVoiceDocument(
          brandVoice,
          params.text,
        );
        resolved.audioUrl = resolvedBrandVoice.audioUrl;
        resolved.elevenlabsVoiceId =
          resolvedBrandVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
        resolved.heygenVoiceId =
          resolvedBrandVoice.heygenVoiceId ?? resolved.heygenVoiceId;
      }
    }

    if (
      !resolved.photoUrl &&
      !resolved.photoIngredientId &&
      organizationIdentityDefaults.defaultAvatarIngredientId
    ) {
      resolved.photoIngredientId = String(
        organizationIdentityDefaults.defaultAvatarIngredientId,
      );
    }

    if (
      !resolved.photoUrl &&
      !resolved.photoIngredientId &&
      organizationIdentityDefaults.defaultAvatarPhotoUrl
    ) {
      resolved.photoUrl = organizationIdentityDefaults.defaultAvatarPhotoUrl;
    }

    if (
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      organizationIdentityDefaults.defaultVoiceRef
    ) {
      const resolvedOrganizationDefaultVoice = await this.resolveSavedVoiceRef(
        organizationIdentityDefaults.defaultVoiceRef,
        context.organizationId,
        params.text,
      );
      resolved.audioUrl = resolvedOrganizationDefaultVoice.audioUrl;
      resolved.elevenlabsVoiceId =
        resolvedOrganizationDefaultVoice.elevenlabsVoiceId ??
        resolved.elevenlabsVoiceId;
      resolved.heygenVoiceId =
        resolvedOrganizationDefaultVoice.heygenVoiceId ??
        resolved.heygenVoiceId;
    }

    if (
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      organizationIdentityDefaults.defaultVoiceId
    ) {
      const organizationVoice = await this.findVoiceById(
        organizationIdentityDefaults.defaultVoiceId.toString(),
        context.organizationId,
      );
      if (organizationVoice) {
        const resolvedOrganizationVoice = await this.resolveVoiceDocument(
          organizationVoice,
          params.text,
        );
        resolved.audioUrl = resolvedOrganizationVoice.audioUrl;
        resolved.elevenlabsVoiceId =
          resolvedOrganizationVoice.elevenlabsVoiceId ??
          resolved.elevenlabsVoiceId;
        resolved.heygenVoiceId =
          resolvedOrganizationVoice.heygenVoiceId ?? resolved.heygenVoiceId;
      }
    }

    return resolved;
  }

  private async resolveSavedVoiceRef(
    defaultVoiceRef: DefaultVoiceRef,
    organizationId: string,
    text: string,
  ): Promise<ResolvedIdentity> {
    if (
      defaultVoiceRef.source === 'cloned' &&
      defaultVoiceRef.internalVoiceId != null
    ) {
      const clonedVoice = await this.findVoiceById(
        defaultVoiceRef.internalVoiceId.toString(),
        organizationId,
      );

      if (!clonedVoice) {
        return {};
      }

      return this.resolveVoiceDocument(clonedVoice, text);
    }

    if (defaultVoiceRef.source !== 'catalog') {
      return {};
    }

    if (
      defaultVoiceRef.provider === VoiceProvider.ELEVENLABS &&
      defaultVoiceRef.externalVoiceId
    ) {
      return { elevenlabsVoiceId: defaultVoiceRef.externalVoiceId };
    }

    if (
      defaultVoiceRef.provider === VoiceProvider.HEYGEN &&
      defaultVoiceRef.externalVoiceId
    ) {
      return { heygenVoiceId: defaultVoiceRef.externalVoiceId };
    }

    return {};
  }

  private async resolvePhotoUrl(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
    resolvedPhotoIngredientId?: string,
    resolvedPhotoUrl?: string,
  ): Promise<string> {
    if (resolvedPhotoUrl) {
      return resolvedPhotoUrl;
    }

    if (resolvedPhotoIngredientId) {
      const avatarIngredient =
        await this.ingredientsService.findAvatarImageById(
          resolvedPhotoIngredientId,
          context.organizationId,
        );

      if (!avatarIngredient) {
        throw new HttpException(
          {
            detail:
              'Configured default avatar must reference an avatar image ingredient in this organization',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (avatarIngredient.cdnUrl) {
        return avatarIngredient.cdnUrl;
      }

      return `${this.configService.ingredientsEndpoint}/avatars/${avatarIngredient._id}`;
    }

    if (!params.avatarId) {
      throw new HttpException(
        {
          detail:
            'Either photoUrl must be provided or identity defaults must resolve a default avatar image',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const heygenByokKey = await this.byokService.resolveApiKey(
      context.organizationId,
      ByokProvider.HEYGEN,
    );
    const avatars = await this.heygenService.getAvatars(
      context.organizationId,
      undefined,
      heygenByokKey?.apiKey,
    );
    const avatar = avatars.find(
      (candidate) => candidate.avatarId === params.avatarId,
    );

    if (!avatar) {
      throw new NotFoundException(
        `Avatar with ID ${params.avatarId} not found`,
      );
    }

    return avatar.preview;
  }

  private async resolveAudioSource(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
    resolvedIdentity: ResolvedIdentity,
  ): Promise<ResolvedAudioSource> {
    if (resolvedIdentity.audioUrl) {
      return {
        audioDuration: 0,
        audioUrl: resolvedIdentity.audioUrl,
      };
    }

    if (params.audioUrl) {
      return {
        audioDuration: 0,
        audioUrl: params.audioUrl,
      };
    }

    if (resolvedIdentity.elevenlabsVoiceId) {
      if (params.text.trim().length === 0) {
        throw new HttpException(
          {
            detail: 'Text is required when using a voice',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const elevenLabsByokKey = await this.byokService.resolveApiKey(
        context.organizationId,
        ByokProvider.ELEVENLABS,
      );
      const audioResult = await this.elevenlabsService.generateAndUploadAudio(
        resolvedIdentity.elevenlabsVoiceId,
        params.text,
        new Types.ObjectId().toHexString(),
        context.organizationId,
        context.userId,
        elevenLabsByokKey?.apiKey,
      );

      return {
        audioDuration: audioResult.duration,
        audioUrl: audioResult.audioUrl,
      };
    }

    if (resolvedIdentity.heygenVoiceId) {
      if (params.text.trim().length === 0) {
        throw new HttpException(
          {
            detail: 'Text is required when using a voice',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        audioDuration: 0,
        heygenVoiceId: resolvedIdentity.heygenVoiceId,
      };
    }

    throw new HttpException(
      {
        detail:
          'A voice or audio source is required. Provide audioUrl, clonedVoiceId, elevenlabsVoiceId, heygenVoiceId, or configure saved identity defaults.',
        title: 'Validation failed',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private async resolveVoiceDocument(
    voiceDoc: Pick<
      VoiceDocument,
      'externalVoiceId' | 'provider' | 'sampleAudioUrl'
    >,
    text: string,
  ): Promise<ResolvedIdentity> {
    if (
      voiceDoc.provider === VoiceProvider.ELEVENLABS &&
      voiceDoc.externalVoiceId
    ) {
      return { elevenlabsVoiceId: voiceDoc.externalVoiceId };
    }

    if (
      voiceDoc.provider === VoiceProvider.HEYGEN &&
      voiceDoc.externalVoiceId
    ) {
      return { heygenVoiceId: voiceDoc.externalVoiceId };
    }

    if (
      voiceDoc.provider === VoiceProvider.HEYGEN &&
      voiceDoc.externalVoiceId
    ) {
      return { heygenVoiceId: voiceDoc.externalVoiceId };
    }

    if (
      voiceDoc.provider === VoiceProvider.GENFEED_AI &&
      voiceDoc.sampleAudioUrl
    ) {
      const fleetResult = await this.fleetService.generateVoice({
        referenceAudio: voiceDoc.sampleAudioUrl,
        text,
      });

      if (!fleetResult?.jobId) {
        throw new HttpException(
          {
            detail: 'Failed to generate audio from saved cloned voice',
            title: 'Avatar video generation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const pollResult = await this.fleetService.pollJob(
        'voices',
        fleetResult.jobId,
      );

      if (!pollResult?.audioUrl || typeof pollResult.audioUrl !== 'string') {
        throw new HttpException(
          {
            detail: 'Voice generation completed without an audio URL',
            title: 'Avatar video generation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return { audioUrl: pollResult.audioUrl };
    }

    return {};
  }

  private async publishInitialStatus(
    ingredientId: string,
    userId: string,
  ): Promise<void> {
    // @ts-expect-error publishFileProcessing has legacy signature
    await this.websocketService.publishFileProcessing(
      WebSocketPaths.video(ingredientId),
      {
        eventType: WebSocketEventType.VIDEO_GENERATED,
        id: ingredientId,
        status: WebSocketEventStatus.PROCESSING,
      },
      userId,
      `user-${userId}`,
    );
  }

  private async findVoiceById(
    voiceId: string,
    organizationId: string,
  ): Promise<VoiceDocument | null> {
    return (await this.voicesService.findOne({
      _id: new Types.ObjectId(voiceId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    })) as VoiceDocument | null;
  }

  private async findBrandForContext(
    context: AvatarVideoGenerationContext,
  ): Promise<BrandDocument> {
    const brand = context.brandId
      ? await this.brandsService.findOne(
          {
            _id: new Types.ObjectId(context.brandId),
            isDeleted: false,
            organization: new Types.ObjectId(context.organizationId),
          },
          'none',
        )
      : await this.brandsService.findOne(
          {
            isDeleted: false,
            organization: new Types.ObjectId(context.organizationId),
          },
          'none',
        );

    if (!brand) {
      throw new HttpException(
        {
          detail: `No active brand found for organization ${context.organizationId}`,
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return brand;
  }
}
