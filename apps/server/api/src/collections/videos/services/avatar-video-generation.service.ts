import type {
  AvatarGenerationFunding,
  AvatarGenerationPrice,
  AvatarVideoGenerationContext,
  AvatarVideoGenerationParams,
  AvatarVideoGenerationResult,
  ResolvableVoiceDocument,
  ResolvedAudioSource,
  ResolvedIdentity,
} from '@api/collections/videos/services/avatar-video-generation.types';

export type { AvatarGenerationPrice } from '@api/collections/videos/services/avatar-video-generation.types';

import { randomUUID } from 'node:crypto';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { type GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { AvatarVideoReferenceService } from '@api/collections/videos/services/avatar-video-reference.service';
import { isMaterializableSavedVoice } from '@api/collections/videos/services/saved-voice-materialization';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { type VoiceDocument } from '@api/collections/voices/schemas/voice.schema';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
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
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
  VoiceProvider,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AvatarVideoLifecycleService } from './avatar-video-lifecycle.service';

@Injectable()
export class AvatarVideoGenerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly byokService: ByokService,
    private readonly avatarBilling: AvatarVideoBillingService,
    private readonly elevenlabsService: ElevenLabsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly managedInferenceRuntimeService: ManagedInferenceRuntimeService,
    private readonly heygenService: HeyGenService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly orgSettingsService: OrganizationSettingsService,
    private readonly personasService: PersonasService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly voicesService: VoicesService,
    private readonly lifecycleService: AvatarVideoLifecycleService,
    private readonly referenceService: AvatarVideoReferenceService,
  ) {}

  /** Quote the same resolved identity and funding sources generation will use. */
  async quoteCredits(
    params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
  ): Promise<AvatarGenerationPrice> {
    const brand = await this.findBrandForContext(context);
    const identity = await this.resolveIdentityInputs(params, context, brand);
    await this.admitCharacter(identity, brand.id, context);
    this.assertUsableVoiceSource(params, identity);
    const { billingMode, credits } = await this.resolveFunding(
      identity,
      context,
    );
    return { billingMode, credits };
  }

  /**
   * The photo an avatar renders from may be a character's reference image.
   * A character the brand can no longer use is refused before funding (#6040).
   */
  private async admitCharacter(
    identity: ResolvedIdentity,
    brandId: string,
    context: AvatarVideoGenerationContext,
  ): Promise<string | null> {
    const { personaId } = await this.personasService.resolveCharacterReferences(
      {
        brandId,
        ingredientIds: identity.photoIngredientId
          ? [identity.photoIngredientId]
          : [],
        organizationId: context.organizationId,
        path: 'avatar-video',
      },
    );
    return personaId;
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
    return this.avatarBilling.quotePlatformCredits();
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
    let providerSubmissionStarted = false;

    try {
      const brand = await this.findBrandForContext(context);
      const resolvedIdentity = await this.resolveIdentityInputs(
        params,
        context,
        brand,
      );
      const personaId = await this.admitCharacter(
        resolvedIdentity,
        brand.id,
        context,
      );
      this.assertUsableVoiceSource(params, resolvedIdentity);
      const funding = await this.resolveFunding(resolvedIdentity, context);
      billing =
        funding.billingMode === 'byok'
          ? context.request
          : await this.avatarBilling.openBilling(
              funding,
              context,
              placeholderScope,
            );
      ownsBillingPool = billing !== undefined && billing !== context.request;

      const { ingredientData, metadataData } = await this.createAvatarDocuments(
        brand.id,
        resolvedIdentity,
        context,
        placeholderScope,
        personaId,
      );

      ingredientId = String(ingredientData.id);
      await this.lifecycleService.announceProcessing({
        brandId: brand.id,
        ingredientId,
        organizationId: context.organizationId,
        userId: context.userId,
      });
      await onPlaceholderCreated?.(ingredientId);
      await this.avatarBilling.assertPlaceholderCredits(
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
        await this.avatarBilling.bindOutput(billing, {
          credits: billing.creditsConfig?.amount ?? funding.credits,
          ingredientId,
          submissionIntentProvider: ByokProvider.HEYGEN,
        });
      }

      providerSubmissionStarted = true;
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

      await this.persistAcceptedAvatar(
        context,
        metadataData.id,
        ingredientId,
        externalId,
        audioDuration,
      );

      return {
        externalId,
        ingredientId,
        status: 'processing',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      await this.failUnsubmittedOrRejectedAvatar(
        ingredientId,
        context,
        error,
        providerSubmissionStarted,
        providerAccepted,
      );

      throw this.generationFailure(error);
    } finally {
      // Credits no accepted render claimed (a failure before HeyGen took the
      // job) go back; a fully bound hold makes this a no-op.
      if (ownsBillingPool && billing) {
        await this.avatarBilling.releasePool(billing);
      }
    }
  }

  private async failUnsubmittedOrRejectedAvatar(
    ingredientId: string | null,
    context: AvatarVideoGenerationContext,
    error: unknown,
    providerSubmissionStarted: boolean,
    providerAccepted: boolean,
  ): Promise<void> {
    if (
      !ingredientId ||
      providerAccepted ||
      (providerSubmissionStarted &&
        !(error instanceof HeyGenSubmissionRejectedError))
    )
      return;
    if (error instanceof HeyGenSubmissionRejectedError) {
      await this.avatarBilling.recordSubmissionRejection(
        ingredientId,
        context.organizationId,
      );
    }
    await this.recordGenerationFailure(ingredientId, context, error);
    await this.avatarBilling.releaseGenerationHold(
      ingredientId,
      context.organizationId,
    );
  }

  /**
   * Chooses what pays for a platform-funded render: the request's own hold when
   * the credits guard reserved one, otherwise a hold the service opens itself.
   * Runs before any provider work so an unaffordable render fails first.
   */
  private generationFailure(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    return new HttpException(
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

  private createAvatarDocuments(
    brandId: string,
    identity: ResolvedIdentity,
    context: AvatarVideoGenerationContext,
    placeholderScope?: GenerationPlaceholderScope,
    personaId?: string | null,
  ): ReturnType<SharedService['createMediaDocumentsInternal']> {
    return this.sharedService.createMediaDocumentsInternal({
      origin: IngredientOrigin.GENERATED,
      brandId,
      category: IngredientCategory.AVATAR,
      extension: MetadataExtension.MP4,
      groupId: placeholderScope?.groupId,
      groupIndex: placeholderScope?.groupIndex,
      model: MODEL_KEYS.HEYGEN_AVATAR,
      organizationId: context.organizationId,
      parentId:
        identity.photoIngredientId != null
          ? identity.photoIngredientId
          : undefined,
      personaId,
      status: IngredientStatus.PROCESSING,
      userId: context.userId,
    });
  }

  private async persistAcceptedAvatar(
    context: AvatarVideoGenerationContext,
    metadataId: string,
    ingredientId: string,
    externalId: string,
    audioDuration: number,
  ): Promise<void> {
    try {
      await this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          duration: audioDuration > 0 ? audioDuration : undefined,
          externalId,
        }),
      );
    } catch (error: unknown) {
      await this.avatarBilling.rememberAcceptedOutput({
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
    return this.referenceService.resolvePhotoUrl(
      params,
      context,
      resolvedPhotoIngredientId,
      resolvedPhotoUrl,
    );
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
