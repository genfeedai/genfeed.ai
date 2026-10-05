import type {
  ModelBillableCompletionInput,
  ModelBillableCompletionQuote,
  ModelBillablePricingProfile,
  ModelBillableQuote,
  ModelBillableQuoteRequest,
  ModelBillableQuoteSnapshot,
  ProviderQuoteDimensions,
  VariantEvidence,
} from '@genfeedai/contracts/interfaces';
import {
  ceilDecimalPricingRatio,
  multiplyDecimalPricing,
} from './decimal-pricing';
import { resolveBillableProviderCost } from './live-model-pricing';
import { applyMargin } from './plans-pricing';
import {
  quoteReviewedProviderPricing,
  selectorValuesEqual,
} from './reviewed-provider-pricing';
import { resolveVariantSelectors } from './reviewed-rates/variant-selectors';

/**
 * A pending provider contract is price drift only when its normalized rates
 * (`hashReviewedProviderRates`) differ from the reviewed contract's. A schema
 * or provider-version change with the same prices is not drift, and a drift
 * never blocks pricing: the reviewed rate keeps charging until an operator
 * approves the pending one. The provider sync stamps a pending candidate on
 * every observed endpoint, including models that were never reviewed; those
 * have no reviewed rate hash and so never drift.
 */
export function hasPendingProviderRateDrift(
  reviewedRateHash: string | null | undefined,
  pendingRateHash: string | null | undefined,
): boolean {
  return Boolean(
    reviewedRateHash && pendingRateHash && pendingRateHash !== reviewedRateHash,
  );
}

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

/** Selector keys whose value is a billable quantity of the same request. */
const QUANTITY_BACKED_SELECTORS = { duration: 'duration' } as const;

/** One immutable bill-time result for admission, display, and settlement. */
export function quoteModelBillablePricing(
  model: ModelBillablePricingProfile,
  input: ModelBillableQuoteRequest,
  marginMultiplier: number | null,
  quotedAt: string,
  evidence?: VariantEvidence,
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
  // `hasPendingRate` is review metadata only: a detected provider price change
  // keeps charging the last approved rate until an operator approves the new one.
  let selected = input.selectors;
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
    // Rates are refreshed by the provider sync rather than expired by age:
    // the verification date must exist and cannot be in the future.
    const verifiedAtMs = Date.parse(pricing.verifiedAt);
    if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > Date.parse(quotedAt))
      return unresolved(
        'Provider rate verification date is missing or in the future',
      );
    if (pricing.variantRules) {
      const resolved = resolveVariantSelectors(
        pricing.variantRules,
        evidence,
        selected,
      );
      if (resolved.status === 'unresolved') return resolved;
      selected = resolved.selectors;
    }
    const invariantSelectors = new Set(pricing.invariantSelectors ?? []);
    // A selector that is also a billable quantity is derived from the quantity
    // when absent, and the two must agree when both are given.
    const declaredSelectorKeys = new Set([
      ...pricing.rates.flatMap((rate) => Object.keys(rate.when)),
      ...invariantSelectors,
    ]);
    for (const [key, quantity] of Object.entries(QUANTITY_BACKED_SELECTORS)) {
      const amount = input[quantity];
      if (!declaredSelectorKeys.has(key) || typeof amount !== 'number')
        continue;
      const explicit = selected?.[key];
      if (explicit === undefined) {
        selected = { ...selected, [key]: amount };
      } else if (!selectorValuesEqual(explicit, amount)) {
        return unresolved(
          `Selected ${key} disagrees with the billed ${quantity}`,
        );
      }
    }
    quantities.selectors = selected ? { ...selected } : undefined;
    if (quantities.selectors === undefined) delete quantities.selectors;
    if (
      model.requiredSelectorKeys.some(
        (key) => !invariantSelectors.has(key) && selected?.[key] === undefined,
      )
    )
      return unresolved(
        'Provider pricing dimension requires an explicit selected value',
      );
    const selectorKeys = new Set([
      ...pricing.rates.flatMap((rate) => Object.keys(rate.when)),
      ...(pricing.invariantSelectors ?? []),
    ]);
    if (Object.keys(selected ?? {}).some((key) => !selectorKeys.has(key)))
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
    const selectedRates = pricing.rates.filter((rate) =>
      Object.entries(rate.when).every(([key, value]) =>
        selectorValuesEqual(selected?.[key], value),
      ),
    );
    allocationBasis = selectedRates.every(
      (rate) => rate.unit === 'request' && !rate.isPerOutput,
    )
      ? 'request'
      : 'output';
  } else {
    if (
      model.requiresReviewedRates ||
      model.requiredSelectorKeys.length > 0 ||
      Object.keys(selected ?? {}).length
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
          unitCredits = multiplyDecimalPricing(
            input.duration,
            model.costPerUnit,
          );
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
          unitCredits = multiplyDecimalPricing(
            input.width,
            input.height,
            0.000001,
            model.costPerUnit,
          );
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
      credits = ceilDecimalPricingRatio(
        [
          Math.max(unitCredits, model.minCost ?? 0),
          allocationBasis === 'request' ? requests : outputs,
        ],
        1,
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
      pricingProfile: {
        ...model,
        requiredSelectorKeys: [...model.requiredSelectorKeys],
        reviewedPricing: model.reviewedPricing
          ? {
              ...model.reviewedPricing,
              ...(model.reviewedPricing.variantRules
                ? {
                    variantRules: structuredClone(
                      model.reviewedPricing.variantRules,
                    ),
                  }
                : {}),
              invariantSelectors: [
                ...new Set([
                  ...(model.reviewedPricing.invariantSelectors ?? []),
                  ...model.reviewedPricing.rates.flatMap((rate) =>
                    Object.keys(rate.when),
                  ),
                ]),
              ],
              rates: model.reviewedPricing.rates
                .filter((rate) =>
                  Object.entries(rate.when).every(([key, value]) =>
                    selectorValuesEqual(selected?.[key], value),
                  ),
                )
                .map((rate) => ({ ...rate, when: { ...rate.when } })),
            }
          : null,
      },
      allocatedCredits: allocateBillableCredits(
        credits,
        allocationBasis === 'request' ? requests : outputs,
      ),
    },
  };
}

/** Price durable completion from reserved rate evidence, independently of output positions.
 * Billing supplies successfulRequests under its existing failure-cost contract.
 * This does not settle a wallet or infer the disposition of a failed request fee.
 */
export function quoteModelBillableCompletion(
  snapshot: ModelBillableQuoteSnapshot,
  completion: ModelBillableCompletionInput,
): ModelBillableCompletionQuote {
  const unresolved = (reason: string): ModelBillableCompletionQuote => ({
    status: 'unresolved',
    reason,
  });
  const { completedOutputs, successfulRequests } = completion;
  const admittedSelectors = snapshot.quantities.selectors ?? {};
  const supplied = completion.selectors;
  if (
    supplied !== undefined &&
    // Supplied values must match canonically (`'6'` equals `6`); a
    // quantity-backed selector (duration) may be left to its quantity.
    (Object.entries(supplied).some(
      ([key, value]) =>
        admittedSelectors[key] === undefined ||
        !selectorValuesEqual(value, admittedSelectors[key]),
    ) ||
      Object.keys(admittedSelectors).some(
        (key) =>
          supplied[key] === undefined && !(key in QUANTITY_BACKED_SELECTORS),
      ))
  )
    return unresolved('Completion selectors differ from the admitted variant');
  const reservedOutputs = snapshot.quantities.outputs ?? 1;
  const reservedRequests = snapshot.quantities.requests ?? 1;
  if (
    ![completedOutputs, successfulRequests].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    completedOutputs > reservedOutputs ||
    successfulRequests > reservedRequests
  )
    return unresolved('Completion cardinality exceeds the reserved request');
  if (completedOutputs === 0 && successfulRequests === 0)
    return { status: 'priced', credits: 0, billableProviderCostUsd: 0 };
  if (completedOutputs === 0 || successfulRequests === 0)
    return unresolved(
      'Request fee disposition requires the existing successful-request contract',
    );
  const rates = snapshot.pricingProfile.reviewedPricing?.rates ?? [];
  const hasRequestComponent =
    snapshot.pricingProfile.pricingType === 'per-request' ||
    rates.some((rate) => rate.unit === 'request');
  if (
    hasRequestComponent &&
    (completedOutputs !== reservedOutputs ||
      successfulRequests !== reservedRequests) &&
    snapshot.pricingProfile.requestCompletionPolicy !== 'successful-request'
  )
    return unresolved(
      'Partial request-component settlement requires an approved frozen completion policy',
    );
  // Shared input usage cannot be guessed by dividing outputs or request counts.
  if (successfulRequests !== reservedRequests) {
    const usageKeys = {
      'input-second': 'inputDuration',
      'input-megapixel': 'inputMegapixels',
      'input-token': 'inputTokens',
      'output-token': 'outputTokens',
      character: 'characters',
      reference: 'references',
    } as const;
    for (const rate of rates) {
      const key = usageKeys[rate.unit as keyof typeof usageKeys];
      if (key && completion[key] === undefined)
        return unresolved(
          'Completed input/usage quantities are required for partial requests',
        );
    }
  }
  const quantities = {
    ...snapshot.quantities,
    ...completion,
    outputs: completedOutputs,
    requests: successfulRequests,
  };
  const quote = quoteModelBillablePricing(
    snapshot.pricingProfile,
    {
      ...quantities,
      modelKey: snapshot.modelKey,
      provider: snapshot.provider,
    },
    snapshot.marginMultiplier,
    snapshot.quotedAt,
    { kind: 'frozen' },
  );
  if (quote.status === 'unresolved') return quote;
  if (quote.snapshot.credits > snapshot.credits)
    return unresolved(
      'Completed usage exceeds the reserved credit authorization',
    );
  return {
    status: 'priced',
    credits: quote.snapshot.credits,
    billableProviderCostUsd: quote.snapshot.providerCostUsd,
  };
}
