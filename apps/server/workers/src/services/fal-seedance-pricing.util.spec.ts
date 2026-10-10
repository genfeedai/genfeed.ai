import { readFileSync } from 'node:fs';
import type { ReviewedProviderPricing } from '@genfeedai/contracts/interfaces';
import {
  quoteModelBillablePricing,
  quoteReviewedProviderPricing,
  resolveVariantSelectors,
} from '@genfeedai/pricing';
import type { NormalizedFalPrice } from '@workers/crons/fal-model-watcher/fal-pricing';
import { prepareFalModelContract } from '@workers/services/fal-model-contract.util';
import { observeFalSeedancePricing } from '@workers/services/fal-seedance-pricing.util';

const fixtures = JSON.parse(
  readFileSync(
    new URL('../../test/fixtures/fal/seedance-contracts.json', import.meta.url),
    'utf8',
  ),
) as Array<{
  endpoint: string;
  providerCategory: string;
  contract: { openapi: Record<string, unknown>; pricing: NormalizedFalPrice[] };
}>;

function tariff(endpoint: string): ReviewedProviderPricing {
  const fixture = fixtures.find((row) => row.endpoint === endpoint);
  if (!fixture) throw new Error('Missing provider fixture');
  const pricing = observeFalSeedancePricing(endpoint, fixture.contract.pricing);
  if (!pricing) throw new Error('Missing verified tariff');
  return { ...pricing, reviewStatus: 'approved' };
}

describe('authenticated Seedance native token tariffs', () => {
  it('admits captured tariffs at the UTC observation time without a future verification date', () => {
    const key = 'bytedance/seedance-2.0/text-to-video';
    const observedAt = '2026-10-09T22:07:02.989Z';
    expect(
      quoteModelBillablePricing(
        {
          key,
          provider: 'fal',
          isActive: true,
          isDeleted: false,
          isFree: false,
          pricingType: 'conditional',
          providerCostUsd: null,
          cost: 0,
          costPerUnit: null,
          minCost: null,
          requiredSelectorKeys: ['resolution'],
          requiresReviewedRates: true,
          hasPendingRate: false,
          rateVersion: 'captured-v1',
          reviewedPricing: { ...tariff(key), version: 'captured-v1' },
        },
        {
          modelKey: key,
          provider: 'fal',
          width: 1280,
          height: 720,
          framesPerSecond: 24,
          duration: 5,
          selectors: { resolution: '720p' },
        },
        1,
        observedAt,
      ),
    ).toMatchObject({ status: 'priced', snapshot: { providerCostUsd: 1.512 } });
  });
  it.each(fixtures.filter((row) => !row.endpoint.endsWith('draft/complete')))(
    'maps the authenticated tariff and execution schema for $endpoint',
    ({ endpoint, providerCategory, contract }) => {
      const result = prepareFalModelContract(
        {
          endpoint_id: endpoint,
          metadata: {
            category: providerCategory,
          },
          openapi: contract.openapi,
        },
        contract.pricing.map((price) => ({
          endpoint_id: price.endpoint,
          currency: price.currency,
          unit: price.unit,
          unit_price: price.unitPrice,
          ...price.conditionalDimensions,
        })),
      );
      expect(result.mappingStatus).toBe('supported');
      expect(result.pricingType).toBe('conditional');
      expect(result.unitPriceMicros).toBeNull();
      expect(result.pricing).toMatchObject({
        source: 'fal-seedance-token-tariff',
        rates: expect.any(Array),
      });
    },
  );
  it.each([
    ['bytedance/seedance-2.0/text-to-video', '720p', undefined, 1.512],
    ['bytedance/seedance-2.0/fast/text-to-video', '720p', undefined, 1.2096],
    ['bytedance/seedance-2.0/mini/text-to-video', '720p', undefined, 0.756],
    ['bytedance/seedance-2.0/us/text-to-video', '720p', undefined, 1.8144],
    ['bytedance/seedance-2.5/text-to-video', '1080p', undefined, 5.6862],
    ['bytedance/seedance-2.5/us/text-to-video', '1080p', undefined, 6.82344],
    ['fal-ai/bytedance/seedance/v1/pro/text-to-video', '720p', undefined, 0.27],
    [
      'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video',
      '720p',
      undefined,
      0.108,
    ],
    ['fal-ai/bytedance/seedance/v1.5/pro/text-to-video', '720p', false, 0.1296],
    ['fal-ai/bytedance/seedance/v1.5/pro/text-to-video', '720p', true, 0.2592],
  ] as const)(
    'prices %s at %s with audio %s',
    (endpoint, resolution, audio, expected) => {
      const dimensions =
        resolution === '1080p'
          ? { width: 1920, height: 1080 }
          : { width: 1280, height: 720 };
      expect(
        quoteReviewedProviderPricing(
          tariff(endpoint),
          {
            ...dimensions,
            duration: 5,
            framesPerSecond: 24,
            selectors: {
              resolution,
              ...(audio !== undefined ? { generate_audio: audio } : {}),
            },
          },
          1,
        ),
      ).toMatchObject({ status: 'priced', providerCostUsd: expected });
    },
  );
  it.each([
    ['bytedance/seedance-2.0/reference-to-video', 2.7216],
    ['bytedance/seedance-2.0/mini/reference-to-video', 1.6632],
    ['bytedance/seedance-2.5/reference-to-video', 4.16016],
  ] as const)(
    'prices both input and output seconds with the actual %s discount',
    (endpoint, expected) => {
      const pricing = tariff(endpoint);
      const resolved = pricing.variantRules
        ? resolveVariantSelectors(
            pricing.variantRules,
            {
              kind: 'dispatch',
              input: { video_urls: ['https://cdn.test/reference.mp4'] },
            },
            { resolution: '720p' },
          )
        : { status: 'ok' as const, selectors: { resolution: '720p' } };
      if (resolved.status !== 'ok') throw new Error(resolved.reason);
      expect(
        quoteReviewedProviderPricing(
          pricing,
          {
            width: 1280,
            height: 720,
            duration: 5,
            inputDuration: 10,
            framesPerSecond: 24,
            selectors: resolved.selectors,
          },
          1,
        ),
      ).toMatchObject({ status: 'priced', providerCostUsd: expected });
    },
  );
  it('does not infer the unpublished US 4K price from a regional multiplier', () => {
    expect(
      quoteReviewedProviderPricing(
        tariff('bytedance/seedance-2.0/us/text-to-video'),
        {
          width: 3840,
          height: 2160,
          duration: 5,
          framesPerSecond: 24,
          selectors: { resolution: '4k' },
        },
        1,
      ).status,
    ).toBe('unresolved');
  });
  it('quarantines a changed authenticated rate instead of refreshing stale conditional terms', () => {
    const fixture = fixtures[0];
    expect(
      observeFalSeedancePricing(
        fixture.endpoint,
        fixture.contract.pricing.map((price) => ({
          ...price,
          unitPrice: '0.015',
        })),
      ),
    ).toBeNull();
    expect(
      observeFalSeedancePricing(
        fixture.endpoint,
        fixture.contract.pricing.map((price) => ({
          ...price,
          currency: 'EUR',
        })),
      ),
    ).toBeNull();
  });
  it('keeps draft completion quarantined while the published and authenticated tariff conflict', () => {
    const fixture = fixtures.find((row) =>
      row.endpoint.endsWith('draft/complete'),
    );
    if (!fixture) throw new Error('Missing draft fixture');
    expect(
      observeFalSeedancePricing(fixture.endpoint, fixture.contract.pricing),
    ).toBeNull();
    expect(
      prepareFalModelContract(
        {
          endpoint_id: fixture.endpoint,
          metadata: { category: fixture.providerCategory },
          openapi: fixture.contract.openapi,
        },
        fixture.contract.pricing.map((price) => ({
          endpoint_id: price.endpoint,
          currency: price.currency,
          unit: price.unit,
          unit_price: price.unitPrice,
          ...price.conditionalDimensions,
        })),
      ),
    ).toMatchObject({
      schemaFamily: 'video-draft-v1',
      mappingStatus: 'quarantined',
    });
  });
});
