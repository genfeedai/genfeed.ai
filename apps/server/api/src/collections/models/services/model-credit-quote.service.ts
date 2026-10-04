import { ModelsService } from '@api/collections/models/services/models.service';
import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import type { ModelBillableQuoteSnapshot } from '@genfeedai/contracts/interfaces';
import {
  getRuntimeMarginMultiplier,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/** Authoritative admission quote from the exact raw model/provider tariff. */
@Injectable()
export class ModelCreditQuoteService {
  private readonly context = 'ModelCreditQuoteService';

  constructor(
    private readonly modelsService: ModelsService,
    private readonly logger: LoggerService,
  ) {}

  async quoteByKey(
    modelKey: string,
    input: ModelCreditQuoteInput = {},
  ): Promise<number> {
    return (await this.quoteSnapshotByKey(modelKey, input)).credits;
  }

  async quoteSnapshotByKey(
    modelKey: string,
    input: ModelCreditQuoteInput = {},
  ): Promise<ModelBillableQuoteSnapshot> {
    const profile = await this.modelsService.findBillablePricingProfile(
      modelKey,
      input.organizationId,
    );
    if (!profile)
      throw this.unavailable(modelKey, 'Exact model tariff is unavailable');
    if (profile.provider === 'crun')
      throw this.unavailable(
        modelKey,
        'Crun requires an effective-input account quote',
      );
    const quote = quoteModelBillablePricing(
      profile,
      normalizeModelProviderQuoteRequest(profile, modelKey, input),
      getRuntimeMarginMultiplier(),
      new Date().toISOString(),
    );
    if (quote.status === 'unresolved')
      throw this.unavailable(modelKey, quote.reason);
    return quote.snapshot;
  }

  private unavailable(
    modelKey: string,
    reason: string,
  ): ServiceUnavailableException {
    // The 503 body carries the reason for the caller only; without this line
    // nothing in the API log says which tariff gate refused the quote.
    this.logger.warn('Generation pricing unavailable', {
      context: this.context,
      modelKey,
      reason,
    });
    return new ServiceUnavailableException({
      code: 'PRICING_UNAVAILABLE',
      detail: reason,
      modelKey,
      title: 'Pricing is unavailable for this generation',
    });
  }
}
