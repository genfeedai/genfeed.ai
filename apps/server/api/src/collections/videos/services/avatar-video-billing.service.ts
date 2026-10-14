import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
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
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ByokProvider,
  PricingType,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

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
  ) {}

  /**
   * Pin provider keys before reserving, so a BYOK change cannot change who
   * pays, and choose the engine row the render is priced as.
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
    const usesPlatformSpeech =
      Boolean(identity.savedVoice) ||
      (Boolean(identity.elevenlabsVoiceId) && !elevenLabsKey);
    const isByok = connection.binding.kind === 'byok' && !usesPlatformSpeech;
    const quote = isByok
      ? undefined
      : await this.quoteRender(
          selection,
          await this.estimateRenderSeconds(params, identity, organizationId),
        );
    return {
      billingMode: isByok ? 'byok' : 'platform',
      credits: quote?.credits ?? 0,
      ...(quote?.durationQuote ? { durationQuote: quote.durationQuote } : {}),
      ...(selection.engine ? { engine: selection.engine } : {}),
      heygenApiKey: connection.apiKey,
      elevenLabsApiKey: elevenLabsKey?.apiKey,
      modelKey: selection.modelKey,
    };
  }

  /**
   * The clip length a render is held for: a saved narration's measured
   * duration, else an estimate from the script. Settlement corrects either to
   * the duration HeyGen returns.
   */
  private async estimateRenderSeconds(
    params: AvatarVideoGenerationParams,
    identity: ResolvedIdentity,
    organizationId: string,
  ): Promise<number | undefined> {
    const audioIngredientId =
      identity.audioIngredientId ?? params.audioIngredientId;
    if (audioIngredientId) {
      const audio = await this.prisma.ingredient.findFirst({
        select: { metadata: { select: { duration: true } } },
        where: { id: audioIngredientId, isDeleted: false, organizationId },
      });
      const measured = readAvatarDurationSeconds(audio?.metadata?.duration);
      if (measured !== undefined) return Math.ceil(measured);
    }
    return params.text.trim()
      ? estimateAvatarSpeechSeconds(params.text)
      : undefined;
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
      description: `Avatar video generation - ${funding.modelKey}`,
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
