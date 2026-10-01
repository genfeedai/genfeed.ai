import type {
  OpenRouterTextSnapshot,
  ReviewedOpenRouterTextContract,
} from '@api/collections/models/utils/openrouter-text-contract.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';

/** Deliberately synthetic endpoint, ceilings and review evidence. Never a production fallback. */
export function openrouterTextContractFixture(
  pricing?: OpenRouterTextSnapshot['pricing'],
): ReviewedOpenRouterTextContract {
  const snapshot: OpenRouterTextSnapshot = {
    kind: 'genfeed-model-provider-contract',
    version: 1,
    modelId: 'synthetic-model',
    provider: 'openrouter',
    endpoint: 'synthetic/text-model',
    schemaFamily: 'genfeed.openrouter.text-context-ceiling.v1',
    openapiVersion: null,
    openapi: {
      kind: 'genfeed-openrouter-text-contract',
      version: 1,
      adapter: 'openrouter-context-ceiling-v1',
      modelId: 'synthetic-model',
      modelKey: 'synthetic/text-model',
      catalogProvider: 'synthetic-vendor',
      transportProvider: 'openrouter',
      endpointSlug: 'synthetic-provider/region-variant',
      endpointSelection: 'exact',
      contextLength: 10000,
      maximumCompletionTokens: 2000,
      sourceUrls: ['https://synthetic.test.invalid/review'],
      observedAt: '2026-09-30T00:00:00.000Z',
    },
    inputSchema: {
      kind: 'genfeed-openrouter-text-input',
      version: 1,
      modalities: 'text-only',
      messageRoles: ['system', 'user'],
      completionCount: 1,
      outputLimitParameter: 'max_tokens',
      outputLimitAccounting: 'all-billable-completion-tokens',
      reasoning: 'disabled',
      contextOverflow: 'reject',
      contextCompression: 'disabled',
      fallback: 'disabled',
      optionalChargedFeatures: 'disabled',
      retention: { dataCollection: 'deny', zdr: true },
    },
    outputSchema: {
      kind: 'genfeed-openrouter-text-output',
      version: 1,
      responseModelKey: 'synthetic/text-model',
      responseKind: 'single-text-completion',
      tokenAccounting: 'native',
      costAccounting: 'reported-account-cost-usd',
    },
    pricing: pricing ?? {
      kind: 'bounded',
      version: 1,
      currency: 'USD',
      inputUsdPerMillionCeiling: 1,
      completionUsdPerMillionCeiling: 2,
      requestUsdCeiling: 0.0001,
      coverage: 'entire-admitted-context-and-output-range',
      includesApplicableCacheAndTierCharges: true,
      unboundedComponents: false,
    },
    currency: null,
    billingUnit: null,
    unitPrice: null,
    unitPriceMicros: null,
    pricingType: null,
    conditionalDimensions: {},
  };
  return {
    version: quoteSnapshotHash(snapshot),
    reviewedAt: '2026-09-30T00:01:00.000Z',
    snapshot,
  };
}
