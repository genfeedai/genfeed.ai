import { ModelsService } from '@api/collections/models/services/models.service';
import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import type { ModelBillableQuoteSnapshot } from '@genfeedai/contracts/interfaces';
import {
  getRuntimeMarginMultiplier,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/** Authoritative admission quote from the exact raw model/provider tariff. */
@Injectable()
export class ModelCreditQuoteService {
  constructor(private readonly modelsService: ModelsService) {}

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
      input.providerInput
        ? { kind: 'dispatch', input: input.providerInput }
        : undefined,
    );
    if (quote.status === 'unresolved')
      throw this.unavailable(modelKey, quote.reason);
    return quote.snapshot;
  }

  private unavailable(
    modelKey: string,
    reason: string,
  ): ServiceUnavailableException {
    // `message` becomes the exception message; without it Nest falls back to
    // "Service Unavailable Exception" and every agent/MCP caller loses why.
    return new ServiceUnavailableException({
      code: 'PRICING_UNAVAILABLE',
      detail: reason,
      message: `Pricing is unavailable for ${modelKey}: ${reason}`,
      modelKey,
      title: 'Pricing is unavailable for this generation',
    });
  }
}
