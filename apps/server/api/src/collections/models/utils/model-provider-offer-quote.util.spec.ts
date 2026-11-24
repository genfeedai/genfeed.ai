import { findModelProviderOfferQuote } from '@api/collections/models/utils/model-provider-offer-quote.util';
import {
  KIE_MINIMAX_H3_IMAGE_INPUT_SCHEMA,
  KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA,
  KIE_SEEDANCE_FAST_INPUT_SCHEMA,
  KIE_WAN_3_INPUT_SCHEMA,
} from '@api/seeds/model-provider-offers.seed';
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
    const providerInputSchema: Record<string, unknown> =
      falKlingSchemas[endpoint];
    return { ...reviewed(id, 'fal', endpoint), providerInputSchema };
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

describe('MiniMax H3 routing to kie', () => {
  const TEXT = 'minimax-h3/text-to-video';
  const IMAGE = 'minimax-h3/image-to-video';
  const FRAME = 'https://example.com/first.png';

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
      },
    };
    return offer;
  }

  function h3Fixture(isKieActive = true) {
    const replicate = reviewed('replicate-h3', 'replicate', 'minimax/h3');
    replicate.providerInputSchema = {
      type: 'object',
      properties: {
        duration: { type: 'integer' },
        first_frame_image: { type: 'string' },
        prompt: { type: 'string' },
        ratio: { type: 'string' },
        reference_image_urls: { type: 'array' },
        resolution: { type: 'string' },
      },
      required: ['prompt'],
      additionalProperties: false,
    } as typeof replicate.providerInputSchema;
    const kieText = {
      ...reviewed('kie-text', 'kie', TEXT),
      providerInputSchema: KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA,
    };
    const kieImage = {
      ...reviewed('kie-image', 'kie', IMAGE),
      providerInputSchema: KIE_MINIMAX_H3_IMAGE_INPUT_SCHEMA,
    };
    const offers = [replicate, kieText, kieImage].map(
      (executionModel, priority) => ({
        id: executionModel.id,
        executionModel,
        isActive: true,
        priority,
      }),
    );
    const prisma = {
      model: {
        findFirst: vi.fn().mockResolvedValue({
          ...replicate,
          pinnedProvider: null,
          providerOffers: offers,
        }),
      },
      providerRoutingSetting: {
        findMany: vi
          .fn()
          .mockResolvedValue(isKieActive ? [] : [{ provider: 'kie' }]),
      },
    } as unknown as PrismaService;
    return (providerInput: Record<string, unknown>) =>
      findModelProviderOfferQuote(prisma, replicate.key, 'org-1', {
        duration: 5,
        providerInput,
      });
  }

  const BASE = {
    duration: 5,
    prompt: 'Sunrise',
    reference_image_urls: [],
    resolution: '2K',
  };

  it.each([
    ['a text request at 2K', { ...BASE, ratio: '16:9' }, TEXT, 0.65],
    [
      'a text request at 768P',
      { ...BASE, ratio: '9:16', resolution: '768P' },
      TEXT,
      0.4,
    ],
    [
      'a first-frame request',
      { ...BASE, first_frame_image: FRAME, ratio: 'adaptive' },
      IMAGE,
      0.65,
    ],
  ])(
    'sends %s to kie, with Replicate (which costs twice as much) as the fallback',
    async (_case, providerInput, endpoint, replicateCost) => {
      const quote = await h3Fixture()(providerInput);

      expect(quote?.routedDispatch).toMatchObject({
        endpoint,
        fallback: {
          endpoint: 'minimax/h3',
          provider: 'replicate',
          providerCostUsd: replicateCost,
        },
        provider: 'kie',
      });
      expect(quote?.preparedProviderInput).toMatchObject({
        duration: 5,
        resolution: providerInput.resolution,
      });
    },
  );

  it('keeps reference images on Replicate', async () => {
    const quote = await h3Fixture()({
      ...BASE,
      ratio: '16:9',
      reference_image_urls: [FRAME],
    });

    expect(quote?.provider).toBe('replicate');
  });

  it('keeps every request on Replicate while kie is switched off', async () => {
    const quote = await h3Fixture(false)({ ...BASE, ratio: '16:9' });

    expect(quote?.provider).toBe('replicate');
  });
});

describe('Wan 3.0 routing to kie', () => {
  const WAN = 'wan/3-0-video';

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
      },
    };
    return offer;
  }

  function wanFixture() {
    const replicate = reviewed('replicate-wan', 'replicate', 'alibaba/wan-3');
    replicate.providerInputSchema = {
      type: 'object',
      properties: {
        aspect_ratio: { type: 'string' },
        duration: { type: 'integer' },
        negative_prompt: { type: 'string' },
        prompt: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['prompt'],
      additionalProperties: false,
    } as typeof replicate.providerInputSchema;
    const kie = {
      ...reviewed('kie-wan', 'kie', WAN),
      providerInputSchema: KIE_WAN_3_INPUT_SCHEMA,
    };
    const offers = [replicate, kie].map((executionModel, priority) => ({
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
    ['480p', 5 * 0.04],
    ['720p', 5 * 0.08],
    ['1080p', 5 * 0.16],
  ])(
    'keeps a %s request on Replicate, with kie (which costs $%s for 5 s) as the dearer fallback',
    async (resolution, kieCost) => {
      const quote = await wanFixture()({
        aspect_ratio: '16:9',
        duration: 5,
        prompt: 'Sunrise',
        resolution,
      });

      expect(quote?.routedDispatch).toMatchObject({
        endpoint: 'alibaba/wan-3',
        fallback: { endpoint: WAN, provider: 'kie' },
        provider: 'replicate',
      });
      expect(quote?.routedDispatch?.fallback?.providerCostUsd).toBeCloseTo(
        kieCost,
        6,
      );
    },
  );

  it('keeps a request with a negative prompt on Replicate', async () => {
    const quote = await wanFixture()({
      duration: 5,
      negative_prompt: 'blur',
      prompt: 'Sunrise',
      resolution: '720p',
    });

    expect(quote?.provider).toBe('replicate');
  });
});

describe('Seedance 2.0 Fast routing to kie', () => {
  const FAST = 'bytedance/seedance-2-fast';

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
    // Neither provider prices by audio, as the rate seed records for a schema
    // with an audio toggle the sheet does not price.
    Object.assign(offer.providerContracts[0].pricing, {
      invariantSelectors: ['generate_audio'],
    });
    return offer;
  }

  function fastFixture() {
    // Replicate prices Seedance by whether the request carries video input.
    const replicate = reviewed(
      'replicate-fast',
      'replicate',
      'bytedance/seedance-2.0-fast',
    );
    replicate.providerInputSchema = {
      type: 'object',
      properties: {
        aspect_ratio: { type: 'string' },
        duration: { type: 'integer' },
        generate_audio: { type: 'boolean' },
        prompt: { type: 'string' },
        reference_videos: { type: 'array' },
        resolution: { type: 'string' },
        seed: { type: 'integer' },
      },
      required: ['prompt'],
      additionalProperties: false,
    } as typeof replicate.providerInputSchema;
    const kie = {
      ...reviewed('kie-fast', 'kie', FAST),
      providerInputSchema: KIE_SEEDANCE_FAST_INPUT_SCHEMA,
    };
    const offers = [replicate, kie].map((executionModel, priority) => ({
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
    ['480p', 0.35],
    ['720p', 0.75],
  ])(
    'sends a %s request to kie with Replicate ($%s for 5 s) as the fallback',
    async (resolution, replicateCost) => {
      const quote = await fastFixture()({
        aspect_ratio: '16:9',
        duration: 5,
        generate_audio: true,
        prompt: 'Sunrise',
        resolution,
      });

      expect(quote?.routedDispatch).toMatchObject({
        endpoint: FAST,
        fallback: { provider: 'replicate', providerCostUsd: replicateCost },
        provider: 'kie',
      });
    },
  );

  it('keeps a seeded request on Replicate', async () => {
    const quote = await fastFixture()({
      aspect_ratio: '16:9',
      duration: 5,
      generate_audio: true,
      prompt: 'Sunrise',
      resolution: '720p',
      seed: 7,
    });

    expect(quote?.provider).toBe('replicate');
  });
});
