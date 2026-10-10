import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { DefaultGenerationAffordabilityInput } from '@api/services/router/interfaces/router.interfaces';
import { RouterService } from '@api/services/router/router.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import { ModelCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * "Can this organization afford a generation?" The yardstick is one standard
 * image on the organization's default image model: the same registry
 * resolution image generation uses (`RouterService.resolveModelKey`, which
 * honours the organization default and falls back to the registry default),
 * priced through the same tariff path admission charges with
 * (`ModelCreditQuoteService`). The rule follows pricing and the catalog
 * instead of a constant.
 *
 * Generation admission is all-or-nothing, so a balance can sit above zero and
 * still pay for nothing useful; this is the signal the app uses to show the
 * upgrade state once the trial credits are spent.
 */
@Injectable()
export class DefaultGenerationAffordabilityService {
  private readonly context = {
    service: DefaultGenerationAffordabilityService.name,
  };

  constructor(
    private readonly routerService: RouterService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
    private readonly logger: LoggerService,
  ) {}

  /** Credits for one default image, or `null` when they cannot be resolved. */
  async getDefaultImageCredits(
    organizationId: string,
    organizationDefaultImageModel?: string | null,
  ): Promise<number | null> {
    let modelKey: string | undefined;
    try {
      const resolution = await this.routerService.resolveModelKey({
        candidates: [organizationDefaultImageModel],
        category: ModelCategory.IMAGE,
        organizationId,
      });
      modelKey = resolution.key;

      const credits = await this.modelCreditQuote.quoteByKey(modelKey, {
        organizationId,
        outputs: 1,
      });
      return Number.isFinite(credits) && credits > 0 ? credits : null;
    } catch (error: unknown) {
      this.logger.warn('Default image price is unavailable', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        modelKey,
        organizationId,
      });
      return null;
    }
  }

  /**
   * Whether `balance` pays for one default image. Deployments without
   * organization billing always can. An unresolvable price falls back to "any
   * credits left", so a pricing outage never flags a funded organization.
   */
  async canAffordDefaultGeneration({
    organizationId,
    balance,
    organizationDefaultImageModel,
  }: DefaultGenerationAffordabilityInput): Promise<boolean> {
    if (!hasOrganizationBilling()) {
      return true;
    }
    if (balance <= 0) {
      return false;
    }

    const price = await this.getDefaultImageCredits(
      organizationId,
      organizationDefaultImageModel,
    );
    return price === null || balance >= price;
  }
}
