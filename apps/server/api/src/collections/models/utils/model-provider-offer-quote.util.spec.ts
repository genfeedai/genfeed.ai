import { findModelProviderOfferQuote } from '@api/collections/models/utils/model-provider-offer-quote.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  findReviewedRateSheetEntry,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import falKlingSchemas from './fixtures/fal-kling-v3-input-schemas.json';

function registration(id: string, provider: string, price: number) {
  const endpoint = `${provider}/video`;
  return {
    id,
    key: endpoint,
    endpoint,
    provider,
    organizationId: null,
    category: 'video',
    isActive: true,
    isDeleted: false,
    isFree: false,
    pricingType: 'per-second',
    providerCostUsd: null,
    cost: 0,
    costPerUnit: null,
    minCost: null,
    hasResolutionOptions: false,
    hasAudioToggle: false,
    providerSchemaFamily: 'video',
    providerInputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string' }, duration: { type: 'number' } },
      required: ['prompt', 'duration'],
      additionalProperties: false,
    },
    reviewedProviderContractVersion: 'v1',
    pendingProviderContractVersion: null,
    providerContracts: [
      {
        provider,
        endpoint,
        version: 'v1',
        reviewStatus: 'approved',
        mappingStatus: 'supported',
        pricing: {
          sourceUrl: `https://${provider}.example/prices`,
          verifiedAt: '2026-10-01T00:00:00Z',
          currency: 'USD',
          rates: [
            {
              component: 'video',
              unit: 'second',
              unitPriceUsd: price,
              when: {},
            },
          ],
        },
        conditionalDimensions: {},
        discoveredAt: new Date('2026-10-01'),
        lastSeenAt: new Date('2026-10-01'),
      },
    ],
  };
}
function fixture() {
  const primary = registration('primary', 'replicate', 0.2);
  const cheaper = registration('cheaper', 'fal', 0.1);
  const offers = [primary, cheaper].map((executionModel, priority) => ({
    id: executionModel.id,
    executionModel,
    isActive: true,
    priority,
  }));
  const model = {
    ...primary,
    pinnedProvider: null as string | null,
    providerOffers: offers,
  };
  const findFirst = vi.fn().mockResolvedValue(model);
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = {
    model: { findFirst },
    providerRoutingSetting: { findMany },
  } as unknown as PrismaService;
  const quote = () =>
    findModelProviderOfferQuote(prisma, primary.key, 'org-1', {
      duration: 8,
      providerInput: { duration: 8, prompt: 'A sunrise' },
    });
  return { model, offers, primary, cheaper, findMany, quote };
}
beforeEach(() => setRuntimeMarginMultiplier(3.33));
describe('logical model provider routing', () => {
  it('chooses the cheapest compatible reviewed provider while keeping the logical key', async () => {
    const f = fixture();
    const profile = await f.quote();
    expect(profile).toMatchObject({
      key: f.primary.key,
      provider: 'fal',
      routedDispatch: { offerId: 'cheaper', endpoint: 'fal/video' },
    });
  });
  it('honors a pin even when that provider is more expensive', async () => {
    const f = fixture();
    f.model.pinnedProvider = 'replicate';
    expect((await f.quote())?.provider).toBe('replicate');
  });
  it('excludes disabled offers and globally disabled providers', async () => {
    const f = fixture();
    f.findMany.mockResolvedValue([{ provider: 'fal', isActive: false }]);
    expect((await f.quote())?.provider).toBe('replicate');
    f.findMany.mockResolvedValue([]);
    f.offers[1].isActive = false;
    expect((await f.quote())?.provider).toBe('replicate');
  });
  it('does not escape a disabled provider pin', async () => {
    const f = fixture();
    f.model.pinnedProvider = 'fal';
    f.offers[1].isActive = false;
    await expect(f.quote()).rejects.toMatchObject({
      response: { code: 'PRICING_UNAVAILABLE' },
    });
  });
  it('rejects an incompatible input instead of dropping a requested feature', async () => {
    const f = fixture();
    f.cheaper.providerInputSchema.properties = {
      prompt: { type: 'string' },
    } as typeof f.cheaper.providerInputSchema.properties;
    expect((await f.quote())?.provider).toBe('replicate');
  });
  it('excludes a provider whose contract has no reviewed rate', async () => {
    const f = fixture();
    f.cheaper.providerContracts = [];
    expect((await f.quote())?.provider).toBe('replicate');
  });
});

describe('Kling v3 routing to fal', () => {
  const PRO_TEXT = 'fal-ai/kling-video/v3/pro/text-to-video';
  const PRO_IMAGE = 'fal-ai/kling-video/v3/pro/image-to-video';

  const REPLICATE_KLING = 'kwaivgi/kling-v3-video';

  /** A registration priced from its real rate-sheet entry. */
  function reviewed(id: string, provider: string, endpoint: string) {
    const offer = registration(id, provider, 0);
    const entry = findReviewedRateSheetEntry(provider, endpoint);
    if (!entry) throw new Error(`missing ${provider} rate for ${endpoint}`);
    offer.key = endpoint;
    offer.endpoint = endpoint;
    offer.providerContracts[0] = {
      ...offer.providerContracts[0],
      endpoint,
      pricing: {
        ...offer.providerContracts[0].pricing,
        rates:
          entry.rates as (typeof offer.providerContracts)[0]['pricing']['rates'],
        ...(entry.variantRules ? { variantRules: entry.variantRules } : {}),
      },
    };
    return offer;
  }

  function falKling(id: string, endpoint: keyof typeof falKlingSchemas) {
    const offer = reviewed(id, 'fal', endpoint);
    offer.providerInputSchema = falKlingSchemas[
      endpoint
    ] as typeof offer.providerInputSchema;
    return offer;
  }

  function klingFixture() {
    const replicate = reviewed('replicate-kling', 'replicate', REPLICATE_KLING);
    replicate.providerInputSchema = {
      type: 'object',
      properties: {
        aspect_ratio: { type: 'string' },
        duration: { type: 'number' },
        mode: { type: 'string' },
        prompt: { type: 'string' },
        start_image: { type: 'string' },
      },
      required: ['prompt', 'duration'],
      additionalProperties: false,
    } as typeof replicate.providerInputSchema;
    const offers = [
      replicate,
      falKling('fal-pro-text', PRO_TEXT),
      falKling('fal-pro-image', PRO_IMAGE),
    ].map((executionModel, priority) => ({
      id: executionModel.id,
      executionModel,
      isActive: true,
      priority,
    }));
    const prisma = {
      model: {
        findFirst: vi.fn().mockResolvedValue({
          ...replicate,
          pinnedProvider: null,
          providerOffers: offers,
        }),
      },
      providerRoutingSetting: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    return (providerInput: Record<string, unknown>) =>
      findModelProviderOfferQuote(prisma, replicate.key, 'org-1', {
        duration: 5,
        providerInput,
      });
  }

  it.each([
    [
      'a text request',
      { aspect_ratio: '16:9', duration: 5, mode: 'pro', prompt: 'Sunrise' },
      PRO_TEXT,
    ],
    [
      'an image request',
      {
        aspect_ratio: '16:9',
        duration: 5,
        mode: 'pro',
        prompt: 'Sunrise',
        start_image: 'https://example.com/start.png',
      },
      PRO_IMAGE,
    ],
  ])(
    'sends %s to the matching fal endpoint with Replicate as the fallback',
    async (_case, providerInput, endpoint) => {
      const quote = klingFixture();

      expect((await quote(providerInput))?.routedDispatch).toMatchObject({
        endpoint,
        // Replicate's Pro rate without audio: 5 s at $0.224.
        fallback: {
          endpoint: REPLICATE_KLING,
          provider: 'replicate',
          providerCostUsd: 1.12,
        },
        provider: 'fal',
      });
    },
  );

  it('keeps a 4K request on Replicate', async () => {
    const quote = klingFixture();

    expect(
      (await quote({ duration: 5, mode: '4k', prompt: 'Sunrise' }))?.provider,
    ).toBe('replicate');
  });
});
