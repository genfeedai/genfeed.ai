import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import {
  estimateAvatarSpeechSeconds,
  readAvatarDurationSeconds,
} from '@api/collections/videos/services/avatar-video-duration.util';
import type {
  AvatarGenerationFunding,
  AvatarModelSelection,
  AvatarRenderQuote,
  AvatarVideoGenerationContext,
  AvatarVideoGenerationParams,
  ResolvedIdentity,
} from '@api/collections/videos/services/avatar-video-generation.types';
import { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import { quoteSpeechSnapshot } from '@api/collections/voices/utils/speech-quote.util';
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ByokService } from '@api/services/byok/byok.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ByokProvider,
  PricingType,
  VoiceProvider,
} from '@genfeedai/contracts';
import {
  countSpeechCharacters,
  MODEL_KEYS,
  VOICE_SPEECH_MODELS,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * The ElevenLabs model platform speech uses when the platform settings name
 * none, which is also the ElevenLabs API default. Platform speech is
 * dispatched with the model it was priced on, so the two cannot drift.
 */
const DEFAULT_PLATFORM_SPEECH_MODEL_KEY = MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2;

/** The catalog provider of platform speech: its rows are `elevenlabs/<model>`. */
const PLATFORM_SPEECH_PROVIDER = 'elevenlabs';

/** Owns admission, output funding and attachment recovery for an avatar render. */
@Injectable()
export class AvatarVideoBillingService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly generationBilling: GenerationBillingService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
    private readonly loggerService: LoggerService,
    private readonly avatarModels: AvatarVideoModelService,
    private readonly byokService: ByokService,
    private readonly heygenService: HeyGenService,
    private readonly prisma: PrismaService,
    private readonly filesClient: FilesClientService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * Pin provider keys before reserving, so a BYOK change cannot change who
   * pays, and choose the engine row the render is priced as. A render on the
   * organization's own HeyGen key is free to the platform unless platform
   * ElevenLabs speaks for it; then only that speech is charged (#6932).
   */
  async resolveFunding(
    params: AvatarVideoGenerationParams,
    identity: ResolvedIdentity,
    organizationId: string,
  ): Promise<AvatarGenerationFunding> {
    const selection = await this.avatarModels.resolve(
      params,
      identity.avatarRef,
      organizationId,
    );
    const connection =
      identity.heygenConnection ??
      (await this.heygenService.resolveOrganizationConnection(organizationId));
    identity.heygenConnection = connection;
    const elevenLabsKey = identity.elevenlabsVoiceId
      ? await this.byokService.lookupApiKey(
          organizationId,
          ByokProvider.ELEVENLABS,
        )
      : null;
    const keys = {
      ...(selection.engine ? { engine: selection.engine } : {}),
      heygenApiKey: connection.apiKey,
      elevenLabsApiKey: elevenLabsKey?.apiKey,
      modelKey: selection.modelKey,
    };
    const usesPlatformElevenLabs =
      Boolean(identity.elevenlabsVoiceId) && !elevenLabsKey;
    if (connection.binding.kind === 'byok') {
      // A saved Genfeed voice is spoken by Genfeed's own managed voices
      // runtime, which has no per-character rate: owner decision (#6932) is
      // that it is included with a render on the organization's own HeyGen
      // key, so only platform ElevenLabs speech is charged here.
      if (!usesPlatformElevenLabs)
        return { ...keys, billingMode: 'byok', credits: 0 };
      return {
        ...keys,
        ...(await this.quotePlatformSpeech(params.text, organizationId)),
      };
    }
    const quote = await this.quoteRender(
      selection,
      await this.estimateRenderSeconds(params, identity, organizationId),
    );
    return {
      ...keys,
      billingMode: 'platform',
      credits: quote.credits,
      ...(quote.durationQuote ? { durationQuote: quote.durationQuote } : {}),
    };
  }

  /**
   * The speech the platform provides for a render on the organization's own
   * HeyGen key: ElevenLabs on the platform account, priced per character from
   * the speech model's own reviewed row, as Studio Voice prices it. The hold
   * is that quote alone and settles as held; HeyGen's per-second rate is the
   * organization's own bill.
   */
  private async quotePlatformSpeech(
    text: string,
    organizationId: string,
  ): Promise<
    Pick<
      AvatarGenerationFunding,
      'billingMode' | 'credits' | 'speechModelId' | 'speechModelKey'
    >
  > {
    if (!text.trim())
      throw new BadRequestException('Add a script for the voice to speak.');
    const configured = (await this.platformSettings.getFeatureSettings())
      .elevenlabsModel;
    const speechModelKey = configured
      ? `${PLATFORM_SPEECH_PROVIDER}/${configured}`
      : DEFAULT_PLATFORM_SPEECH_MODEL_KEY;
    const speechModel = VOICE_SPEECH_MODELS[speechModelKey];
    if (speechModel?.voiceProvider !== VoiceProvider.ELEVENLABS)
      throw new ServiceUnavailableException({
        code: 'PRICING_UNAVAILABLE',
        detail: `${speechModelKey} is not a priced speech model.`,
        message: 'Speech pricing is unavailable right now',
        modelKey: speechModelKey,
        title: 'Pricing unavailable',
      });
    const characters = countSpeechCharacters(text);
    if (characters > speechModel.maxCharacters)
      throw new BadRequestException(
        `The script is longer than the voice can speak (${speechModel.maxCharacters} characters).`,
      );
    const snapshot = await quoteSpeechSnapshot(this.modelCreditQuote, {
      characters,
      modelKey: speechModelKey,
      organizationId,
      provider: PLATFORM_SPEECH_PROVIDER,
    });
    return {
      billingMode: 'platform',
      credits: snapshot.credits,
      speechModelId: speechModel.providerModelId,
      speechModelKey,
    };
  }

  /**
   * The clip length a render is held for. Audio that drives the clip is the
   * meter: its measured length, never the script. A script alone is
   * estimated. Settlement corrects either to the duration HeyGen returns.
   */
  private async estimateRenderSeconds(
    params: AvatarVideoGenerationParams,
    identity: ResolvedIdentity,
    organizationId: string,
  ): Promise<number | undefined> {
    const audioIngredientId =
      identity.audioIngredientId ?? params.audioIngredientId;
    const audioUrl = identity.audioUrl ?? params.audioUrl;
    if (!audioIngredientId && !audioUrl)
      return params.text.trim()
        ? estimateAvatarSpeechSeconds(params.text)
        : undefined;
    const measured = await this.measureAudioSeconds({
      audioIngredientId,
      audioUrl,
      organizationId,
    });
    if (measured === undefined)
      throw new BadRequestException(
        'The narration length could not be measured, so this avatar cannot be priced. Choose a saved narration with a known length.',
      );
    return Math.ceil(measured);
  }

  /**
   * The measured length of the audio that drives a render: the narration
   * ingredient's recorded duration, else a probe of the audio itself.
   */
  private async measureAudioSeconds(input: {
    audioIngredientId?: string;
    audioUrl?: string;
    organizationId: string;
  }): Promise<number | undefined> {
    if (!input.audioIngredientId)
      throw new BadRequestException(
        'Select a saved narration asset so the priced audio is the audio rendered.',
      );
    const audio = await this.prisma.ingredient.findFirst({
      select: { metadata: { select: { duration: true } } },
      where: {
        id: input.audioIngredientId,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
    if (!audio) return undefined;
    const measured = readAvatarDurationSeconds(audio?.metadata?.duration);
    if (measured !== undefined) return measured;
    if (!input.audioUrl) return undefined;
    return this.probeAudioSeconds(input.audioUrl);
  }

  private async probeAudioSeconds(url: string): Promise<number | undefined> {
    try {
      const probe = await this.filesClient.probeMediaFromUrl(url, 'audio');
      return readAvatarDurationSeconds(probe.durationSeconds);
    } catch (error: unknown) {
      this.loggerService.warn('Avatar narration length could not be probed', {
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
      return undefined;
    }
  }

  /**
   * Binds a render to its hold before its provider id is persisted, carrying
   * the frozen per-second quote that settlement re-prices.
   */
  bindRender(
    request: GenerationBillingRequest,
    funding: AvatarGenerationFunding,
    ingredientId: string,
  ): Promise<void> {
    return this.generationBilling.bindOutput(request, {
      credits: request.creditsConfig?.amount ?? funding.credits,
      ingredientId,
      ...(funding.durationQuote
        ? { metadata: { avatarDurationQuote: funding.durationQuote } }
        : {}),
      submissionIntentProvider: ByokProvider.HEYGEN,
    });
  }

  /**
   * The photo-animation price of a script, for callers that quote before a
   * render resolves its identity (remix runs and scenes): the per-second
   * `heygen/avatar` row at the script's estimated length.
   */
  async quotePlatformCredits(script: string): Promise<number> {
    if (!script.trim())
      throw new BadRequestException('Add a script to price this avatar.');
    return (
      await this.quoteRender(
        { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
        estimateAvatarSpeechSeconds(script),
      )
    ).credits;
  }

  /**
   * Admission price for a render at its estimated clip length. Photo animation
   * is priced on the per-second `heygen/avatar` row; an engine row from the
   * reviewed `avatar_type` rate, and an avatar type the sheet does not price is
   * refused, never guessed. The frozen quote rides on the hold so settlement
   * re-prices it at the duration HeyGen returns.
   */
  async quoteRender(
    selection: AvatarModelSelection,
    estimatedSeconds: number | undefined,
  ): Promise<AvatarRenderQuote> {
    const { avatarType, engine } = selection;
    if (engine && !avatarType)
      throw new BadRequestException(
        'The avatar type could not be verified, so the render cannot be priced.',
      );
    if (estimatedSeconds === undefined)
      throw new BadRequestException(
        'Add a script or a saved narration with a known length to price this avatar.',
      );
    if (!engine || !avatarType)
      return this.quotePhotoAnimation(estimatedSeconds);
    const snapshot = await this.modelCreditQuote.quoteSnapshotByKey(
      selection.modelKey,
      {
        duration: estimatedSeconds,
        selectors: { avatar_type: avatarType },
      },
    );
    // A flat reading of the per-second row would bill one second as a clip.
    if (snapshot.costSource !== 'reviewed-provider' || !(snapshot.credits > 0))
      throw new ServiceUnavailableException({
        code: 'PRICING_UNAVAILABLE',
        detail: 'The avatar engine has no reviewed per-second rate.',
        message: `Pricing is unavailable for ${selection.modelKey}: the avatar engine has no reviewed per-second rate.`,
        modelKey: selection.modelKey,
        title: 'Pricing is unavailable for this generation',
      });
    return {
      credits: snapshot.credits,
      durationQuote: { estimatedSeconds, snapshot },
    };
  }

  /**
   * HeyGen bills photo animation at one per-second rate with no selector, so
   * the configured provider cost and the reviewed rate agree and either may
   * price it. It must still be metered per second: a flat reading would bill
   * one second as the whole clip, and zero would be a free render.
   */
  private async quotePhotoAnimation(
    estimatedSeconds: number,
  ): Promise<AvatarRenderQuote> {
    const snapshot = await this.modelCreditQuote.quoteSnapshotByKey(
      MODEL_KEYS.HEYGEN_AVATAR,
      { duration: estimatedSeconds },
    );
    if (
      snapshot.pricingProfile.pricingType !== PricingType.PER_SECOND ||
      !Number.isFinite(snapshot.credits) ||
      !(snapshot.credits > 0)
    )
      throw new BusinessLogicException(
        'Avatar video pricing is not configured',
        { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
        'PRICING_NOT_CONFIGURED',
      );
    return {
      credits: snapshot.credits,
      durationQuote: { estimatedSeconds, snapshot },
    };
  }

  async openBilling(
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
      brandId: context.brandId,
      credits: funding.credits,
      description: funding.speechModelKey
        ? `Avatar video speech - ${funding.speechModelKey}`
        : `Avatar video generation - ${funding.modelKey}`,
      organizationId: context.organizationId,
      source: ActivitySource.VIDEO_GENERATION,
      userId: context.userId,
    });
  }

  recordSubmissionRejection(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    return this.generationBilling.recordSubmissionRejection(
      ingredientId,
      organizationId,
    );
  }

  async releaseGenerationHold(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        `AvatarVideoBillingService generation hold release failed`,
        error,
        { ingredientId, organizationId },
      );
    }
  }

  async assertPlaceholderCredits(
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

  /**
   * Platform hold for `POST /videos/lip-sync`. The voice ingredient's measured
   * duration is the meter, else a probe of `audioUrl` (its own media URL);
   * an unmeasurable voice refuses the render instead of charging a flat
   * credit. A customer HeyGen key skips the platform hold.
   */
  async fundLipSync(input: {
    audioIngredientId: string;
    audioUrl?: string;
    brandId?: string | null;
    organizationId: string;
    useCustomerKey: boolean;
    userId: string;
  }): Promise<{
    funding: AvatarGenerationFunding;
    request?: GenerationBillingRequest;
  }> {
    if (input.useCustomerKey) {
      return {
        funding: {
          billingMode: 'byok',
          credits: 0,
          modelKey: MODEL_KEYS.HEYGEN_AVATAR,
        },
      };
    }
    const measured = await this.measureAudioSeconds(input);
    if (measured === undefined) {
      throw new BadRequestException(
        'Add a saved narration with a known length to price this avatar.',
      );
    }
    const quote = await this.quotePhotoAnimation(Math.ceil(measured));
    const request = await this.generationBilling.holdForService({
      brandId: input.brandId,
      credits: quote.credits,
      description: 'Lip-sync photo avatar video generation',
      organizationId: input.organizationId,
      source: ActivitySource.VIDEO_GENERATION,
      userId: input.userId,
    });
    return {
      funding: {
        billingMode: 'platform',
        credits: quote.credits,
        ...(quote.durationQuote ? { durationQuote: quote.durationQuote } : {}),
        modelKey: MODEL_KEYS.HEYGEN_AVATAR,
      },
      request,
    };
  }

  releasePool(request: GenerationBillingRequest): Promise<void> {
    return this.generationBilling.releasePool(request);
  }

  async rememberAcceptedOutput(
    input: Parameters<GenerationBillingService['rememberAcceptedOutput']>[0],
  ): Promise<void> {
    try {
      await this.generationBilling.rememberAcceptedOutput(input);
    } catch (error: unknown) {
      this.loggerService.error(
        'Accepted avatar attachment recovery failed; retain its funding',
        error,
        input,
      );
    }
  }
}
