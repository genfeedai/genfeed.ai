import { randomUUID } from 'node:crypto';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import { isMaterializableSavedVoice } from '@api/collections/videos/services/saved-voice-materialization';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { type VoiceDocument } from '@api/collections/voices/schemas/voice.schema';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivityKey,
  ActivitySource,
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  VoiceProvider,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AvatarVideoLifecycleService } from './avatar-video-lifecycle.service';

interface AvatarVideoGenerationContext {
  organizationId: string;
  userId: string;
  brandId?: string;
  /**
   * The caller's own run-level billing (remix run, batch project) already pays
   * for this generation, so the service must not hold credits for it.
   */
  settleCreditsExternally?: boolean;
  /**
   * The HTTP or agent request whose credits guard reserved this generation.
   * When it holds platform credits, the accepted output is bound to that hold;
   * otherwise the service opens its own.
   */
  request?: GenerationBillingRequest;
}

interface AvatarVideoGenerationParams {
  text: string;
  useIdentity?: boolean;
  photoUrl?: string;
  photoIngredientId?: string;
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

export interface AvatarGenerationPrice {
  billingMode: 'byok' | 'platform';
  credits: number;
}

interface AvatarGenerationFunding extends AvatarGenerationPrice {
  heygenApiKey?: string;
  elevenLabsApiKey?: string;
}

interface ResolvedIdentity {
  audioUrl?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  photoIngredientId?: string;
  photoUrl?: string;
  savedVoice?: ResolvableVoiceDocument;
}

type ResolvableVoiceDocument = Pick<
  VoiceDocument,
  'externalVoiceId' | 'sampleAudioUrl'
> & {
  provider?: VoiceProvider | string | null;
};

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
    private readonly generationBilling: GenerationBillingService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
    private readonly elevenlabsService: ElevenLabsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly managedInferenceRuntimeService: ManagedInferenceRuntimeService,
    private readonly heygenService: HeyGenService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly orgSettingsService: OrganizationSettingsService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly voicesService: VoicesService,
    private readonly lifecycleService: AvatarVideoLifecycleService,
  ) {}

  /** Quote the same resolved identity and funding sources generation will use. */
  async quoteCredits(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
  ): Promise<AvatarGenerationPrice> {
    const brand = await this.findBrandForContext(context);
    const identity = await this.resolveIdentityInputs(params, context, brand);
    this.assertUsableVoiceSource(params, identity);
    const { billingMode, credits } = await this.resolveFunding(
      identity,
      context,
    );
    return { billingMode, credits };
  }

  /** Pin provider keys before reserving, so a BYOK change cannot change who pays. */
  private async resolveFunding(
    identity: ResolvedIdentity,
    context: AvatarVideoGenerationContext,
  ): Promise<AvatarGenerationFunding> {
    const heygenKey = await this.byokService.resolveApiKey(
      context.organizationId,
      ByokProvider.HEYGEN,
    );
    const elevenLabsKey = identity.elevenlabsVoiceId
      ? await this.byokService.resolveApiKey(
          context.organizationId,
          ByokProvider.ELEVENLABS,
        )
      : null;
    const usesPlatformSpeech =
      Boolean(identity.savedVoice) ||
      (Boolean(identity.elevenlabsVoiceId) && !elevenLabsKey);
    const isByok = Boolean(heygenKey) && !usesPlatformSpeech;
    return {
      billingMode: isByok ? 'byok' : 'platform',
      credits: isByok ? 0 : await this.quotePlatformCredits(),
      heygenApiKey: heygenKey?.apiKey,
      elevenLabsApiKey: elevenLabsKey?.apiKey,
    };
  }

  /**
   * The platform price comes from the `heygen/avatar` model row, the same row
   * the credits guard reserves from. A row that resolves to no price fails
   * closed: with no fallback constant, zero would mean a free render.
   */
  async quotePlatformCredits(): Promise<number> {
    const credits = await this.modelCreditQuote.quoteByKey(
      MODEL_KEYS.HEYGEN_AVATAR,
    );
    if (!Number.isFinite(credits) || !(credits > 0)) {
      throw new BusinessLogicException(
        'Avatar video pricing is not configured',
        { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
        'PRICING_NOT_CONFIGURED',
      );
    }
    return credits;
  }

  async generateAvatarVideo(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
    onPlaceholderCreated?: GenerationPlaceholderCreatedCallback,
    placeholderScope?: GenerationPlaceholderScope,
    onCreditsPrepared?: (price: AvatarGenerationPrice) => Promise<void>,
  ): Promise<AvatarVideoGenerationResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let ingredientId: string | null = null;
    let billing: GenerationBillingRequest | undefined;
    let ownsBillingPool = false;
    let providerAccepted = false;

    try {
      const brand = await this.findBrandForContext(context);
      const resolvedIdentity = await this.resolveIdentityInputs(
        params,
        context,
        brand,
      );
      this.assertUsableVoiceSource(params, resolvedIdentity);
      const funding = await this.resolveFunding(resolvedIdentity, context);
      billing =
        funding.billingMode === 'byok'
          ? context.request
          : await this.openBilling(funding, context, placeholderScope);
      ownsBillingPool = billing !== undefined && billing !== context.request;

      const { ingredientData, metadataData } =
        await this.sharedService.createMediaDocumentsInternal({
          brandId: brand.id,
          category: IngredientCategory.AVATAR,
          extension: MetadataExtension.MP4,
          groupId: placeholderScope?.groupId,
          groupIndex: placeholderScope?.groupIndex,
          model: MODEL_KEYS.HEYGEN_AVATAR,
          organizationId: context.organizationId,
          parentId:
            resolvedIdentity.photoIngredientId != null
              ? resolvedIdentity.photoIngredientId
              : undefined,
          status: IngredientStatus.PROCESSING,
          userId: context.userId,
        });

      ingredientId = String(ingredientData.id);
      await this.lifecycleService.announceProcessing({
        brandId: brand.id,
        ingredientId,
        organizationId: context.organizationId,
        userId: context.userId,
      });
      await onPlaceholderCreated?.(ingredientId);
      await this.assertPlaceholderCredits(
        context,
        funding.credits,
        placeholderScope,
      );
      await onCreditsPrepared?.({
        billingMode: funding.billingMode,
        credits: funding.credits,
      });

      const photoUrl = await this.resolvePhotoUrl(
        params,
        context,
        resolvedIdentity.photoIngredientId,
        resolvedIdentity.photoUrl,
      );
      await this.metadataService.patch(
        metadataData.id,
        new MetadataEntity({ externalProvider: ByokProvider.HEYGEN }),
      );
      const materializedIdentity = await this.materializeSavedVoice(
        resolvedIdentity,
        params.text,
        context.organizationId,
      );
      const { audioDuration, audioUrl, heygenVoiceId } =
        await this.resolveAudioSource(
          params,
          context,
          materializedIdentity,
          funding,
        );

      // Bind the render to its hold before its provider id is
      // persisted, so a webhook that races this request always finds it.
      if (billing) {
        await this.generationBilling.bindOutput(billing, {
          credits: billing.creditsConfig?.amount ?? funding.credits,
          ingredientId,
        });
      }

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
        funding.heygenApiKey,
        params.aspectRatio ?? '9:16',
      );

      providerAccepted = true;

      try {
        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            duration: audioDuration > 0 ? audioDuration : undefined,
            externalId,
          }),
        );
      } catch (error: unknown) {
        await this.generationBilling.rememberAcceptedOutput({
          ingredientId,
          externalId,
          organizationId: context.organizationId,
          userId: context.userId,
        });
        this.loggerService.error(
          'Accepted avatar provider identity queued for recovery',
          error,
          { ingredientId },
        );
      }
      try {
        await this.lifecycleService.publishInitialStatus(
          ingredientId,
          context.userId,
        );
      } catch (error: unknown) {
        this.loggerService.error(
          'Accepted avatar initial notification failed',
          error,
          { ingredientId },
        );
      }

      return {
        externalId,
        ingredientId,
        status: 'processing',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (ingredientId && !providerAccepted) {
        await this.recordGenerationFailure(ingredientId, context, error);
        await this.releaseGenerationHold(ingredientId, context.organizationId);
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
    } finally {
      // Credits no accepted render claimed (a failure before HeyGen took the
      // job) go back; a fully bound hold makes this a no-op.
      if (ownsBillingPool && billing) {
        await this.generationBilling.releasePool(billing);
      }
    }
  }

  /**
   * Chooses what pays for a platform-funded render: the request's own hold when
   * the credits guard reserved one, otherwise a hold the service opens itself.
   * Runs before any provider work so an unaffordable render fails first.
   */
  private async openBilling(
    funding: AvatarGenerationFunding,
    context: AvatarVideoGenerationContext,
    placeholderScope?: GenerationPlaceholderScope,
  ): Promise<GenerationBillingRequest | undefined> {
    if (
      funding.billingMode !== 'platform' ||
      placeholderScope?.settleCreditsExternally ||
      context.settleCreditsExternally
    ) {
      return undefined;
    }
    if (context.request && this.generationBilling.hasPool(context.request)) {
      return context.request;
    }
    return this.generationBilling.holdForService({
      credits: funding.credits,
      description: `Avatar video generation - ${MODEL_KEYS.HEYGEN_AVATAR}`,
      organizationId: context.organizationId,
      source: ActivitySource.VIDEO_GENERATION,
      userId: context.userId,
    });
  }

  private async releaseGenerationHold(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} generation hold release failed`,
        error,
        { ingredientId, organizationId },
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
      photoIngredientId: params.photoIngredientId,
      photoUrl: params.photoUrl,
    };

    if (
      params.clonedVoiceId &&
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      !resolved.savedVoice
    ) {
      const savedVoice = await this.findVoiceById(
        params.clonedVoiceId,
        context.organizationId,
      );
      if (!savedVoice) {
        throw this.invalidSavedVoiceException();
      }

      const resolvedSavedVoice = this.resolveVoiceLookup({
        ...savedVoice,
        provider: params.voiceProvider ?? savedVoice.provider,
      });
      if (!this.hasUsableVoiceSource(resolvedSavedVoice)) {
        throw this.invalidSavedVoiceException();
      }

      resolved.audioUrl = resolvedSavedVoice.audioUrl;
      resolved.elevenlabsVoiceId =
        resolvedSavedVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
      resolved.heygenVoiceId =
        resolvedSavedVoice.heygenVoiceId ?? resolved.heygenVoiceId;
      resolved.savedVoice =
        resolvedSavedVoice.savedVoice ?? resolved.savedVoice;
    }

    if (!params.useIdentity) {
      return resolved;
    }

    const organizationSettings = await this.orgSettingsService.findOne({
      organizationId: context.organizationId,
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
      !resolved.savedVoice &&
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
      resolved.savedVoice =
        resolvedBrandDefaultVoice.savedVoice ?? resolved.savedVoice;
    }

    if (
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      !resolved.savedVoice &&
      brandIdentityDefaults.defaultVoiceId
    ) {
      const brandVoice = await this.findVoiceById(
        brandIdentityDefaults.defaultVoiceId.toString(),
        context.organizationId,
      );
      if (brandVoice) {
        const resolvedBrandVoice = this.resolveVoiceLookup(brandVoice);
        resolved.audioUrl = resolvedBrandVoice.audioUrl;
        resolved.elevenlabsVoiceId =
          resolvedBrandVoice.elevenlabsVoiceId ?? resolved.elevenlabsVoiceId;
        resolved.heygenVoiceId =
          resolvedBrandVoice.heygenVoiceId ?? resolved.heygenVoiceId;
        resolved.savedVoice =
          resolvedBrandVoice.savedVoice ?? resolved.savedVoice;
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
      !resolved.savedVoice &&
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
      resolved.savedVoice =
        resolvedOrganizationDefaultVoice.savedVoice ?? resolved.savedVoice;
    }

    if (
      !resolved.audioUrl &&
      !resolved.elevenlabsVoiceId &&
      !resolved.heygenVoiceId &&
      !resolved.savedVoice &&
      organizationIdentityDefaults.defaultVoiceId
    ) {
      const organizationVoice = await this.findVoiceById(
        organizationIdentityDefaults.defaultVoiceId.toString(),
        context.organizationId,
      );
      if (organizationVoice) {
        const resolvedOrganizationVoice =
          this.resolveVoiceLookup(organizationVoice);
        resolved.audioUrl = resolvedOrganizationVoice.audioUrl;
        resolved.elevenlabsVoiceId =
          resolvedOrganizationVoice.elevenlabsVoiceId ??
          resolved.elevenlabsVoiceId;
        resolved.heygenVoiceId =
          resolvedOrganizationVoice.heygenVoiceId ?? resolved.heygenVoiceId;
        resolved.savedVoice =
          resolvedOrganizationVoice.savedVoice ?? resolved.savedVoice;
      }
    }

    return resolved;
  }

  private async resolveSavedVoiceRef(
    defaultVoiceRef: DefaultVoiceRef,
    organizationId: string,
    _text: string,
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

      return this.resolveVoiceLookup(clonedVoice);
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

      const avatarUrl = readIngredientMediaUrl(avatarIngredient);
      if (avatarUrl) {
        return avatarUrl;
      }

      return `${this.configService.ingredientsEndpoint}/avatars/${avatarIngredient.id}`;
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
      throw new NotFoundException('Avatar', params.avatarId);
    }

    return avatar.preview;
  }

  private async resolveAudioSource(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
    resolvedIdentity: ResolvedIdentity,
    funding: AvatarGenerationFunding,
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

      const audioResult = await this.elevenlabsService.generateAndUploadAudio(
        resolvedIdentity.elevenlabsVoiceId,
        params.text,
        randomUUID(),
        context.organizationId,
        context.userId,
        funding.elevenLabsApiKey,
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
    voiceDoc: ResolvableVoiceDocument,
    text: string,
    organizationId: string,
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
      voiceDoc.provider === VoiceProvider.GENFEED_AI &&
      voiceDoc.sampleAudioUrl
    ) {
      const runtimeResult =
        await this.managedInferenceRuntimeService.generateVoice({
          organizationId,
          referenceAudio: voiceDoc.sampleAudioUrl,
          text,
        });

      if (!runtimeResult?.jobId) {
        throw new HttpException(
          {
            detail: 'Failed to generate audio from saved cloned voice',
            title: 'Avatar video generation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const pollResult = await this.managedInferenceRuntimeService.pollJob(
        'voices',
        runtimeResult.jobId,
        organizationId,
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

  private resolveVoiceLookup(
    voiceDoc: ResolvableVoiceDocument,
  ): ResolvedIdentity {
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

    if (isMaterializableSavedVoice(voiceDoc)) {
      return { savedVoice: voiceDoc };
    }

    return {};
  }

  private async materializeSavedVoice(
    identity: ResolvedIdentity,
    text: string,
    organizationId: string,
  ): Promise<ResolvedIdentity> {
    if (!identity.savedVoice) return identity;
    const { savedVoice, ...resolved } = identity;
    if (!isMaterializableSavedVoice(savedVoice)) {
      return resolved;
    }
    const materialized = await this.resolveVoiceDocument(
      savedVoice,
      text,
      organizationId,
    );
    return { ...resolved, ...materialized };
  }

  private hasUsableVoiceSource(identity: ResolvedIdentity): boolean {
    return Boolean(
      identity.audioUrl ||
        identity.elevenlabsVoiceId ||
        identity.heygenVoiceId ||
        isMaterializableSavedVoice(identity.savedVoice),
    );
  }

  private assertUsableVoiceSource(
    params: AvatarVideoGenerationParams,
    identity: ResolvedIdentity,
  ): void {
    if (this.hasUsableVoiceSource(identity)) {
      return;
    }
    if (params.clonedVoiceId) {
      throw this.invalidSavedVoiceException();
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

  private invalidSavedVoiceException(): HttpException {
    return new HttpException(
      {
        detail: 'The selected voice must be a usable saved brand voice.',
        title: 'Validation failed',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private async assertPlaceholderCredits(
    context: AvatarVideoGenerationContext,
    credits: number,
    placeholderScope?: GenerationPlaceholderScope,
  ): Promise<void> {
    if (
      !placeholderScope?.settleCreditsExternally ||
      placeholderScope.isByokBypass
    )
      return;
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        context.organizationId,
        credits,
      );
    if (hasCredits) return;
    throw new HttpException(
      {
        detail: 'Insufficient credits for avatar generation.',
        title: 'Insufficient credits',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async recordGenerationFailure(
    ingredientId: string,
    context: AvatarVideoGenerationContext,
    error: unknown,
  ): Promise<void> {
    await this.failedGenerationService.handleFailedVideoGeneration(
      this.videosService,
      ingredientId,
      WebSocketPaths.video(ingredientId),
      context.userId,
      getUserRoomName(context.userId),
      {
        brandId: context.brandId,
        organizationId: context.organizationId,
        userId: context.userId,
        key: ActivityKey.VIDEO_FAILED,
        source: ActivitySource.AVATAR_GENERATION,
        // Must match the processing activity's payload shape: the failure
        // handler JSON-parses this to find the row it has to resolve.
        value: JSON.stringify({
          error: error instanceof Error ? error.message : 'Generation failed',
          ingredientId,
        }),
      },
    );
  }

  private async findVoiceById(
    voiceId: string,
    organizationId: string,
  ): Promise<VoiceDocument | null> {
    return (await this.voicesService.findOne({
      id: voiceId,
      isDeleted: false,
      organizationId: organizationId,
    })) as VoiceDocument | null;
  }

  private async findBrandForContext(
    context: AvatarVideoGenerationContext,
  ): Promise<BrandDocument> {
    const brand = context.brandId
      ? await this.brandsService.findOne(
          {
            id: context.brandId,
            organizationId: context.organizationId,
          },
          'none',
        )
      : await this.brandsService.findOne(
          {
            organizationId: context.organizationId,
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
