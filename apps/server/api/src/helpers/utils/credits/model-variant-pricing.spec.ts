import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  buildGenerationLineReservationIntent,
  generationLineIdentity,
  validateGenerationLineReservationIntent,
} from '@api/helpers/utils/credits/generation-line-reservation.util';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { normalizeModelProviderQuoteRequest } from '@api/helpers/utils/credits/model-provider-quote-request.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { validateStoryboardPreparedMedia } from '@api/helpers/utils/credits/storyboard-prepared-media.schema';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import { ActivitySource } from '@genfeedai/contracts';
import type { ReviewedVariantRule } from '@genfeedai/contracts/interfaces';
import { applyMargin, quoteModelBillablePricing } from '@genfeedai/pricing';
import type { Model, ModelProviderContract } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const rules: ReviewedVariantRule[] = [
  {
    criterionTitle: 'model variant',
    selectorKey: 'model_variant',
    derive: {
      kind: 'field',
      field: 'quality',
      fieldType: 'string',
      valueMap: { auto: 'auto', low: 'low', medium: 'medium', high: 'high' },
      default: 'auto',
    },
  },
];
function variantProfile() {
  return billableProfile({
    key: 'openai/gpt-image-2',
    requiresReviewedRates: true,
    requiredSelectorKeys: ['model_variant'],
    rateVersion: 'v1',
    reviewedPricing: {
      version: 'v1',
      currency: 'USD',
      sourceUrl: 'https://replicate.com/openai/gpt-image-2',
      verifiedAt: '2026-09-30T00:00:00.000Z',
      reviewStatus: 'approved',
      variantRules: structuredClone(rules),
      rates: [
        {
          component: 'output',
          unit: 'output',
          unitPriceUsd: 0.047,
          when: { model_variant: 'medium' },
        },
        {
          component: 'output',
          unit: 'output',
          unitPriceUsd: 0.128,
          when: { model_variant: 'auto' },
        },
      ],
    },
  });
}
function admitted() {
  const profile = variantProfile();
  const input = {
    quality: 'medium',
    prompt: 'private prompt',
    api_key: 'private credential',
  };
  const quote = quoteModelBillablePricing(
    profile,
    normalizeModelProviderQuoteRequest(profile, profile.key, {
      providerInput: input,
      requests: 1,
      outputs: 1,
    }),
    3.33,
    '2026-09-30T00:00:00.000Z',
    { kind: 'dispatch', input },
  );
  if (quote.status !== 'priced') throw new Error(quote.reason);
  return quote.snapshot;
}

describe('derived variant admission adapters', () => {
  it('normalizes actual inputs to canonical selectors without retaining credentials', () => {
    const profile = variantProfile();
    const result = normalizeModelProviderQuoteRequest(profile, profile.key, {
      providerInput: { quality: 'medium', api_key: 'secret' },
      selectors: { quality: 'low' },
      outputs: 1,
    });
    expect(result).toEqual({
      modelKey: profile.key,
      provider: 'replicate',
      outputs: 1,
      selectors: { model_variant: 'medium' },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('retains a conflicting canonical assertion so the admission quote rejects it', async () => {
    const profile = variantProfile();
    const service = new ModelCreditQuoteService({
      findBillablePricingProfile: vi.fn().mockResolvedValue(profile),
    } as never);
    await expect(
      service.quoteSnapshotByKey(profile.key, {
        providerInput: { quality: 'low' },
        selectors: { model_variant: 'high' },
      }),
    ).rejects.toMatchObject({
      response: {
        detail: 'Selected model_variant disagrees with the dispatched quality',
      },
    });
  });
  it('uses the real service to price medium and reject missing dispatch evidence', async () => {
    const profile = variantProfile();
    const service = new ModelCreditQuoteService({
      findBillablePricingProfile: vi.fn().mockResolvedValue(profile),
    } as never);
    const quote = await service.quoteSnapshotByKey(profile.key, {
      providerInput: {
        quality: 'medium',
        prompt: 'private',
        api_key: 'secret',
      },
    });
    expect(quote.providerCostUsd).toBe(0.047);
    expect(quote.quantities.selectors).toEqual({ model_variant: 'medium' });
    expect(JSON.stringify(quote)).not.toContain('secret');
    await expect(
      service.quoteSnapshotByKey(profile.key, {
        selectors: { model_variant: 'medium' },
      }),
    ).rejects.toMatchObject({
      response: {
        detail: 'Variant pricing requires dispatched provider input',
      },
    });
  });
  it('preserves strict snapshot metadata and rejects malformed/unknown rule fields', () => {
    const snapshot = admitted();
    expect(
      quoteSnapshotHash(modelBillableQuoteSnapshotSchema.parse(snapshot)),
    ).toBe(quoteSnapshotHash(snapshot));
    const malformed = structuredClone(snapshot);
    const reviewed = malformed.pricingProfile.reviewedPricing;
    if (!reviewed) throw new Error('missing pricing');
    malformed.pricingProfile.reviewedPricing = {
      ...reviewed,
      variantRules: [],
    };
    expect(() => modelBillableQuoteSnapshotSchema.parse(malformed)).toThrow();
    const value = {
      ...snapshot,
      pricingProfile: {
        ...snapshot.pricingProfile,
        reviewedPricing: {
          ...reviewed,
          variantRules: reviewed.variantRules?.map((rule) => ({
            ...rule,
            private: 'unknown',
          })),
        },
      },
    };
    expect(() => modelBillableQuoteSnapshotSchema.parse(value)).toThrow();
  });
  it('replays a line intent from frozen rules and unchanged arithmetic', () => {
    const owner = {
      kind: 'storyboard-line' as const,
      organizationId: 'org',
      brandId: 'brand',
      runId: 'run',
      operationId: 'operation',
      lineKey: 'line',
      attempt: 1,
      actorUserId: 'user',
      quoteId: 'quote',
      sourceActionId: 'pending',
      preparedHash: 'a'.repeat(64),
    };
    owner.sourceActionId = `storyboard-line-v1:${generationLineIdentity(owner)}`;
    const intent = buildGenerationLineReservationIntent({
      version: 1,
      owner,
      modelQuote: admitted(),
      source: ActivitySource.IMAGE_GENERATION,
      description: 'fixture',
      expiresAt: '2026-10-05T00:00:00.000Z',
    });
    expect(validateGenerationLineReservationIntent(intent)).toEqual(intent);
    expect(intent.modelQuote.credits).toBe(applyMargin(0.047, 3.33));
  });
  it('validates storyboard input against frozen rules and detects variant tampering', () => {
    const allocation = workflowFundingFixture().manifest.allocations.find(
      (item) => item.actionId === 'imageGen',
    );
    if (!allocation) throw new Error('missing image fixture');
    const quote = admitted();
    const dispatch = structuredClone(allocation.dispatch);
    dispatch.modelKey = quote.modelKey;
    dispatch.preparationContract.brief.modelKey = quote.modelKey;
    dispatch.preparationContract.reviewedOutput.modelKey = quote.modelKey;
    dispatch.preparationContract.reviewedOutput.endpoint = quote.modelKey;
    dispatch.preparationContract.reviewedOutput.target = {
      model: quote.modelKey,
    };
    dispatch.target = JSON.stringify({ model: quote.modelKey });
    if (quote.quantities.requests !== 1 || quote.quantities.outputs !== 1) {
      throw new Error('Expected a single-request, single-output image quote');
    }
    dispatch.quantities = {
      ...structuredClone(quote.quantities),
      requests: quote.quantities.requests,
      outputs: quote.quantities.outputs,
    };
    dispatch.contractVersion = `workflow-media-v1:${quoteSnapshotHash(dispatch.preparationContract)}`;
    dispatch.billableFingerprint = quoteSnapshotHash({
      ...dispatch,
      billableFingerprint: undefined,
    });
    const value = {
      version: 1 as const,
      kind: 'media' as const,
      dispatch,
      quote,
      request: {
        kind: 'exact' as const,
        providerInput: { quality: 'medium', prompt: 'test' },
      },
    };
    expect(validateStoryboardPreparedMedia(value).quote?.credits).toBe(
      quote.credits,
    );
    value.request.providerInput.quality = 'low';
    expect(() => validateStoryboardPreparedMedia(value)).toThrow();
  });
});

describe('approved pricing profile rule projection', () => {
  function projected(variantRules: unknown = rules) {
    const profile = variantProfile();
    return projectModelBillablePricingProfile(
      {
        ...profile,
        endpoint: profile.key,
        hasAudioToggle: false,
        hasResolutionOptions: false,
        providerInputSchema: {
          properties: {
            quality: {
              type: 'string',
              enum: ['auto', 'low', 'medium', 'high'],
            },
          },
        },
        reviewedProviderContractVersion: 'v1',
        pendingProviderContractVersion: 'v2',
      } as unknown as Model,
      [
        {
          provider: 'replicate',
          endpoint: profile.key,
          version: 'v1',
          reviewStatus: 'approved',
          mappingStatus: 'supported',
          conditionalDimensions: {},
          pricing: { ...profile.reviewedPricing, variantRules },
          discoveredAt: new Date(),
          lastSeenAt: new Date(),
        } as unknown as ModelProviderContract,
      ],
    );
  }
  it('requires canonical keys instead of consumed provider fields', () => {
    expect(projected().requiredSelectorKeys).toEqual(['model_variant']);
    expect(projected().reviewedPricing?.variantRules).toEqual(rules);
  });
  it.each([[], [{}], null])(
    'fails closed for malformed persisted metadata %j',
    (value) => expect(projected(value).reviewedPricing).toBeNull(),
  );
});
