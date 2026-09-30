import { ModelsService } from '@api/collections/models/services/models.service';
import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
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
    const {
      organizationId: _organizationId,
      providerInput,
      provider,
      ...quantities
    } = input;
    const selectorKeys = new Set([
      ...profile.requiredSelectorKeys,
      ...(profile.reviewedPricing?.invariantSelectors ?? []),
      ...(profile.reviewedPricing?.rates.flatMap((rate) =>
        Object.keys(rate.when),
      ) ?? []),
    ]);
    if (profile.reviewedPricing) {
      quantities.selectors = Object.fromEntries(
        Object.entries(quantities.selectors ?? {}).filter(([key]) =>
          selectorKeys.has(key),
        ),
      );
    }
    if (providerInput) {
      const selectors = { ...quantities.selectors };
      for (const key of selectorKeys) {
        const value =
          providerInput[key] ??
          (key === 'audio'
            ? providerInput.generate_audio
            : key === 'generate_audio'
              ? providerInput.audio
              : undefined);
        if (
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
        )
          selectors[key] = value;
      }
      quantities.selectors = selectors;
      for (const key of ['duration', 'height', 'width'] as const) {
        const value =
          providerInput[key] ??
          (key === 'duration' ? providerInput.seconds : undefined);
        const number =
          typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
            ? Number(value)
            : value;
        if (typeof number === 'number' && Number.isFinite(number) && number > 0)
          quantities[key] = number;
      }
    }
    const quote = quoteModelBillablePricing(
      profile,
      {
        ...quantities,
        modelKey,
        provider:
          provider === 'genfeedai'
            ? 'genfeed-ai'
            : (provider ?? profile.provider),
      },
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
    return new ServiceUnavailableException({
      code: 'PRICING_UNAVAILABLE',
      detail: reason,
      modelKey,
      title: 'Pricing is unavailable for this generation',
    });
  }
}
