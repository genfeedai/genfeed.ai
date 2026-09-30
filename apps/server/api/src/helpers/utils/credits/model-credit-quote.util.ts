import type {
  ModelBillablePricingProfile,
  ProviderQuoteDimensions,
} from '@genfeedai/contracts/interfaces';
import {
  getRuntimeMarginMultiplier,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import { ServiceUnavailableException } from '@nestjs/common';

export interface ModelCreditQuoteInput extends ProviderQuoteDimensions {
  providerInput?: Record<string, unknown>;
  organizationId?: string;
  provider?: string;
}

/** Pure adapter for already resolved, exact server pricing profiles. */
export function quoteModelCredits(
  model: ModelBillablePricingProfile,
  input: ModelCreditQuoteInput = {},
): number {
  const {
    organizationId: _organizationId,
    providerInput: _providerInput,
    provider,
    ...quantities
  } = input;
  const quote = quoteModelBillablePricing(
    model,
    {
      ...quantities,
      modelKey: model.key,
      provider: provider ?? model.provider,
    },
    getRuntimeMarginMultiplier(),
    new Date().toISOString(),
  );
  if (quote.status === 'unresolved')
    throw new ServiceUnavailableException({
      code: 'PRICING_UNAVAILABLE',
      detail: quote.reason,
    });
  return quote.snapshot.credits;
}
