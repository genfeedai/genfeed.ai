import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type {
  AvatarGenerationFunding,
  AvatarModelSelection,
  AvatarRenderQuote,
  AvatarVideoGenerationContext,
} from '@api/collections/videos/services/avatar-video-generation.types';
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ActivitySource } from '@genfeedai/contracts';
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
  ) {}

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

  /**
   * Admission price for a render. Photo animation keeps the flat
   * `heygen/avatar` quote. An engine row is priced per second from the reviewed
   * `avatar_type` rate at the estimated clip length; the frozen quote rides on
   * the hold so settlement re-prices it at the duration HeyGen returns. An
   * avatar type the sheet does not price is refused, never guessed.
   */
  async quoteRender(
    selection: AvatarModelSelection,
    estimatedSeconds: number | undefined,
  ): Promise<AvatarRenderQuote> {
    if (!selection.engine)
      return { credits: await this.quotePlatformCredits() };
    if (!selection.avatarType)
      throw new BadRequestException(
        'The avatar type could not be verified, so the render cannot be priced.',
      );
    if (estimatedSeconds === undefined)
      throw new BadRequestException(
        'Add a script or a saved narration with a known length to price this avatar.',
      );
    const snapshot = await this.modelCreditQuote.quoteSnapshotByKey(
      selection.modelKey,
      {
        duration: estimatedSeconds,
        selectors: { avatar_type: selection.avatarType },
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

  bindOutput(
    request: GenerationBillingRequest,
    input: Parameters<GenerationBillingService['bindOutput']>[1],
  ): Promise<void> {
    return this.generationBilling.bindOutput(request, input);
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
