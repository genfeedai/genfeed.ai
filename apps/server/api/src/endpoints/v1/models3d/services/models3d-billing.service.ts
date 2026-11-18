import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { Models3dQuote } from '@api/endpoints/v1/models3d/interfaces/models3d.interfaces';
import {
  MODELS3D_BUILD_TIERS,
  MODELS3D_DEFAULT_QUALITY,
  MODELS3D_SHEET_MODEL_KEY,
  MODELS3D_SHEET_RESOLUTION,
  type Models3dQuality,
} from '@api/endpoints/v1/models3d/models3d.constants';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ActivitySource } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type Models3dStep = 'build' | 'sheet';

/**
 * Funds the two paid steps of a 3D render. Each step is its own credit hold,
 * bound to the ingredient the step produces before the provider is called, so
 * the poll worker settles it on success and releases it on failure.
 */
@Traced()
@Injectable()
export class Models3dBillingService {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly generationBilling: GenerationBillingService,
    private readonly loggerService: LoggerService,
    private readonly quotes: ModelCreditQuoteService,
  ) {}

  /** Quotes both steps from the reviewed provider rates. */
  async quote(
    organizationId: string,
    quality: Models3dQuality = MODELS3D_DEFAULT_QUALITY,
  ): Promise<Models3dQuote> {
    const [sheet, build] = await Promise.all([
      this.quoteStep('sheet', organizationId),
      this.quoteStep('build', organizationId, quality),
    ]);
    return { build, sheet, total: sheet + build };
  }

  async quoteStep(
    step: Models3dStep,
    organizationId: string,
    quality: Models3dQuality = MODELS3D_DEFAULT_QUALITY,
  ): Promise<number> {
    const modelKey =
      step === 'sheet'
        ? MODELS3D_SHEET_MODEL_KEY
        : MODELS3D_BUILD_TIERS[quality].modelKey;
    const snapshot = await this.quotes.quoteSnapshotByKey(modelKey, {
      organizationId,
      outputs: 1,
      requests: 1,
      ...(step === 'sheet'
        ? { selectors: { resolution: MODELS3D_SHEET_RESOLUTION } }
        : {}),
    });
    if (!Number.isFinite(snapshot.credits) || snapshot.credits <= 0) {
      throw new ServiceUnavailableException({
        code: 'PRICING_UNAVAILABLE',
        message: `3D ${step} pricing is unavailable`,
        modelKey,
      });
    }
    return snapshot.credits;
  }

  /**
   * Holds `credits` and binds the hold to `ingredientId`. A short balance
   * returns 402 with the required and available credits; no provider is
   * called before this resolves.
   */
  async hold(input: {
    brandId?: string;
    credits: number;
    ingredientId: string;
    organizationId: string;
    step: Models3dStep;
    userId: string;
  }): Promise<void> {
    let request: Awaited<
      ReturnType<GenerationBillingService['holdForService']>
    >;
    try {
      request = await this.generationBilling.holdForService({
        ...(input.brandId ? { brandId: input.brandId } : {}),
        credits: input.credits,
        description: `3D render ${input.step}`,
        organizationId: input.organizationId,
        source: ActivitySource.ASSET_GENERATION,
        userId: input.userId,
      });
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        const available = await this.credits.getOrganizationCreditsBalance(
          input.organizationId,
        );
        throw new HttpException(
          {
            available,
            detail: `Insufficient credits: ${input.credits} required, ${available} available`,
            required: input.credits,
            title: 'Insufficient credits',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw error;
    }
    try {
      await this.generationBilling.bindOutput(request, {
        credits: input.credits,
        ingredientId: input.ingredientId,
        metadata: { models3dStep: input.step },
      });
    } finally {
      await this.generationBilling.releasePool(request);
    }
  }

  /** Refunds the step's hold. Never throws: the caller is already failing. */
  async release(ingredientId: string, organizationId: string): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        'Models3dBillingService hold release failed',
        error,
        { ingredientId, organizationId },
      );
    }
  }
}
