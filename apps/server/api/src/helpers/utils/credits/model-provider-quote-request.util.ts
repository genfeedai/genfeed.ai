import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
} from '@genfeedai/contracts/interfaces';

import { resolveVariantSelectors, variantRuleFields } from '@genfeedai/pricing';

/** Shared price-relevant input projection; runtime validation supplies its frozen pricing profile. */
export function normalizeModelProviderQuoteRequest(
  profile: ModelBillablePricingProfile,
  modelKey: string,
  input: ModelCreditQuoteInput,
): ModelBillableQuoteRequest {
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
    const rules = profile.reviewedPricing?.variantRules;
    const ruleKeys = new Set(rules?.map((rule) => rule.selectorKey) ?? []);
    const ruleFields = variantRuleFields(rules ?? []);
    for (const key of ruleFields) {
      if (!ruleKeys.has(key) && quantities.selectors)
        delete quantities.selectors[key];
    }
    const resolved = rules
      ? resolveVariantSelectors(
          rules,
          { kind: 'dispatch', input: providerInput },
          quantities.selectors,
        )
      : undefined;
    const selectors =
      resolved?.status === 'ok'
        ? { ...resolved.selectors }
        : { ...quantities.selectors };
    for (const key of selectorKeys) {
      if (ruleKeys.has(key) || ruleFields.has(key)) continue;
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
  return {
    ...quantities,
    modelKey,
    provider:
      provider === 'genfeedai' ? 'genfeed-ai' : (provider ?? profile.provider),
  };
}
