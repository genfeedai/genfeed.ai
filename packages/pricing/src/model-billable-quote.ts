import type {
  ModelBillablePricingProfile,
  ModelBillableQuote,
  ModelBillableQuoteRequest,
  ModelBillableQuoteSnapshot,
  ProviderQuoteDimensions,
} from '@genfeedai/contracts/interfaces';
import { resolveBillableProviderCost } from './live-model-pricing';
import { applyMargin } from './plans-pricing';
import { quoteReviewedProviderPricing } from './reviewed-provider-pricing';

/** Allocate an already rounded total; never round/multiply a unit quote again. */
export function allocateBillableCredits(
  credits: number,
  count: number,
): number[] {
  if (
    !Number.isSafeInteger(credits) ||
    credits < 0 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 10000
  )
    throw new RangeError('Invalid credit allocation');
  const quotient = Math.floor(credits / count);
  const remainder = credits % count;
  return Array.from(
    { length: count },
    (_, index) => quotient + (index < remainder ? 1 : 0),
  );
}

/** One immutable bill-time result for admission, display, and settlement. */
export function quoteModelBillablePricing(
  model: ModelBillablePricingProfile,
  input: ModelBillableQuoteRequest,
  marginMultiplier: number | null,
  quotedAt: string,
): ModelBillableQuote {
  const unresolved = (reason: string): ModelBillableQuote => ({
    status: 'unresolved',
    reason,
  });
  if (
    !model.isActive ||
    model.isDeleted ||
    !model.key ||
    !model.provider ||
    model.key !== input.modelKey ||
    model.provider !== input.provider
  )
    return unresolved(
      'Exact model/provider is unavailable or does not match dispatch',
    );
  if (!Number.isFinite(Date.parse(quotedAt)))
    return unresolved('Quote date is invalid');
  const outputs = input.outputs ?? 1;
  const requests = input.requests ?? 1;
  if (
    ![outputs, requests].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 10000,
    )
  )
    return unresolved('Request/output count is invalid');
  if (model.hasPendingRate)
    return unresolved('Pending provider rate requires review');
  const { modelKey: _key, provider: _provider, ...suppliedQuantities } = input;
  const quantities: ProviderQuoteDimensions = {
    ...suppliedQuantities,
    outputs,
    requests,
    ...(input.selectors ? { selectors: { ...input.selectors } } : {}),
  };
  let providerCostUsd: number | null;
  let credits: number;
  let costSource: ModelBillableQuoteSnapshot['costSource'];
  let allocationBasis: ModelBillableQuoteSnapshot['allocationBasis'] =
    model.pricingType === 'per-request' ? 'request' : 'output';
  if (model.reviewedPricing) {
    const pricing = model.reviewedPricing;
    if (!model.rateVersion || pricing.version !== model.rateVersion)
      return unresolved('Reviewed rate version does not match model');
    const age = Date.parse(quotedAt) - Date.parse(pricing.verifiedAt);
    if (!Number.isFinite(age) || age < 0 || age > 30 * 86400000)
      return unresolved(
        'Provider rate verification is missing, stale or in the future',
      );
    const selectorKeys = new Set([
      ...pricing.rates.flatMap((rate) => Object.keys(rate.when)),
      ...(pricing.invariantSelectors ?? []),
    ]);
    if (
      Object.keys(input.selectors ?? {}).some((key) => !selectorKeys.has(key))
    )
      return unresolved(
        'Selected pricing dimension has no reviewed applicability',
      );
    if (marginMultiplier === null)
      return unresolved('Configured conversion policy is unavailable');
    const quote = quoteReviewedProviderPricing(
      pricing,
      quantities,
      marginMultiplier,
    );
    if (quote.status === 'unresolved') return quote;
    providerCostUsd = quote.providerCostUsd;
    credits = quote.credits;
    costSource = 'reviewed-provider';
    allocationBasis = pricing.rates.every(
      (rate) => rate.unit === 'request' && !rate.isPerOutput,
    )
      ? 'request'
      : 'output';
  } else {
    if (
      model.requiresReviewedRates ||
      Object.keys(input.selectors ?? {}).length
    )
      return unresolved('Selected variant requires reviewed provider rates');
    if (
      model.isFree &&
      model.cost === 0 &&
      (model.providerCostUsd === null || model.providerCostUsd === 0)
    ) {
      providerCostUsd = 0;
      credits = 0;
      costSource = 'explicit-free';
    } else if (model.providerCostUsd !== null) {
      if (
        marginMultiplier === null ||
        !Number.isFinite(marginMultiplier) ||
        marginMultiplier <= 0
      )
        return unresolved('Configured conversion policy is unavailable');
      providerCostUsd = resolveBillableProviderCost(model, quantities);
      if (providerCostUsd === null)
        return unresolved('Provider rate or bill-time quantity is unavailable');
      credits =
        providerCostUsd === 0
          ? 0
          : applyMargin(providerCostUsd, marginMultiplier);
      costSource = 'configured-provider';
    } else {
      // Compatibility only for explicitly positive legacy tariffs. No UI samples.
      let unitCredits: number;
      switch (model.pricingType ?? 'flat') {
        case 'flat':
        case 'per-request':
          unitCredits = model.cost;
          break;
        case 'per-second':
          if (
            !input.duration ||
            !Number.isFinite(input.duration) ||
            input.duration <= 0 ||
            !model.costPerUnit ||
            model.costPerUnit <= 0
          )
            return unresolved(
              'Legacy metered rate or actual duration is unavailable',
            );
          unitCredits = input.duration * model.costPerUnit;
          break;
        case 'per-megapixel':
          if (
            !input.width ||
            !input.height ||
            !Number.isFinite(input.width) ||
            !Number.isFinite(input.height) ||
            input.width <= 0 ||
            input.height <= 0 ||
            !model.costPerUnit ||
            model.costPerUnit <= 0
          )
            return unresolved(
              'Legacy metered rate or actual dimensions are unavailable',
            );
          unitCredits =
            ((input.width * input.height) / 1000000) * model.costPerUnit;
          break;
        default:
          return unresolved('Legacy billing unit is unsupported');
      }
      if (
        !Number.isFinite(unitCredits) ||
        unitCredits <= 0 ||
        (model.minCost !== null &&
          (!Number.isFinite(model.minCost) || model.minCost < 0))
      )
        return unresolved(
          'Legacy tariff is unavailable; zero is not a free designation',
        );
      credits = Math.ceil(
        Math.max(unitCredits, model.minCost ?? 0) *
          (allocationBasis === 'request' ? requests : outputs),
      );
      providerCostUsd = null;
      costSource = 'legacy-credits';
    }
  }
  if (!Number.isSafeInteger(credits) || credits < 0)
    return unresolved('Quote exceeds supported credit precision');
  return {
    status: 'priced',
    snapshot: {
      modelKey: model.key,
      provider: model.provider,
      rateVersion: model.rateVersion,
      quotedAt,
      marginMultiplier,
      quantities,
      costSource,
      providerCostUsd,
      credits,
      allocationBasis,
      allocatedCredits: allocateBillableCredits(
        credits,
        allocationBasis === 'request' ? requests : outputs,
      ),
    },
  };
}
