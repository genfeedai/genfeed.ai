import type { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import {
  AdsDiscoveryService,
  groupDiscoveryAdvertisers,
  validateDiscoveryQuery,
} from '@api/endpoints/ads-research/ads-discovery.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { normalizeMetaArchiveRecord } from '@genfeedai/integrations/ads';
import { describe, expect, it, vi } from 'vitest';

const query = {
  brandId: 'brand-a',
  keyword: 'coffee',
  platform: AdsPlatform.META,
  countries: 'fr,DE,FR',
  limit: 24,
};
const row = {
  id: 'saved-id',
  externalAccountId: '456',
  externalAdId: '123',
  advertiserName: 'Coffee',
  imageUrls: ['https://example.com/a.jpg'],
  presentationStartDate: '2026-01-01',
  researchObservedAt: new Date('2026-01-11'),
  researchFreshnessState: 'fresh',
  isHalted: false,
};
function setup() {
  const adapter = {
    fetchCreatives: vi.fn(),
    getReadiness: () => ({
      available: false,
      blockers: ['missing_token'],
      documentationUrl: 'https://example.com',
    }),
  };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    acquireOwnedClaim: vi.fn(),
    setOwnedClaimValue: vi.fn(),
    releaseOwnedClaim: vi.fn(),
  };
  const sources = {
    findSavedDiscoverySources: vi.fn().mockResolvedValue([row]),
    upsertBatchAtomic: vi.fn(),
  };
  const service = new AdsDiscoveryService(
    { resolve: () => adapter } as unknown as PaidCreativeProviderRegistry,
    cache as unknown as CacheService,
    sources as unknown as AdPerformanceService,
  );
  return { service, cache, sources, adapter };
}
describe('saved public discovery', () => {
  it.each([
    null,
    { status: 'pending' },
    { status: 'empty' },
    { status: 'unavailable' },
    { status: 'ready', advertisers: 'invalid' },
  ])(
    'reads saved rows despite cache state %j without any collection',
    async (cached) => {
      const { service, cache, sources, adapter } = setup();
      cache.get.mockResolvedValue(cached);
      for (let i = 0; i < 2; i++) {
        const result = await service.discover('org-a', query);
        expect(result.status).toBe('ready');
        expect(result.advertisers[0].samples[0]).toMatchObject({
          adPerformanceId: 'saved-id',
          freshness: 'saved',
          observedAt: '2026-01-11T00:00:00.000Z',
        });
        expect(result.advertisers[0].longevityDays).toBe(10);
      }
      expect(adapter.fetchCreatives).not.toHaveBeenCalled();
      expect(cache.acquireOwnedClaim).not.toHaveBeenCalled();
      expect(cache.setOwnedClaimValue).not.toHaveBeenCalled();
      expect(sources.upsertBatchAtomic).not.toHaveBeenCalled();
    },
  );
  it('falls back to durable rows after cache failure and fails closed on DB errors', async () => {
    const { service, cache, sources } = setup();
    cache.get.mockRejectedValue(new Error('cache'));
    expect((await service.discover('org-a', query)).status).toBe('ready');
    sources.findSavedDiscoverySources.mockRejectedValue(new Error('DB'));
    expect(await service.discover('org-a', query)).toMatchObject({
      status: 'unavailable',
      reason: 'saved_ads_unavailable',
      advertisers: [],
    });
  });
  it('passes only exact-request cached identities to the authorized saved query', async () => {
    const { service, cache, sources } = setup();
    cache.get.mockResolvedValue({
      status: 'ready',
      platform: 'meta',
      query: 'coffee',
      countries: ['DE', 'FR'],
      advertisers: [
        {
          id: 'a',
          name: 'A',
          samples: [
            {
              id: 'ad',
              adPerformanceId: 'saved-id',
              imageUrls: ['https://example.com/a'],
              videoUrls: [],
              mediaUrls: [],
            },
          ],
        },
      ],
    });
    await service.discover('org-a', query);
    expect(sources.findSavedDiscoverySources).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        brandId: 'brand-a',
        cachedSourceIds: ['saved-id'],
        normalizedCountries: ['DE', 'FR'],
      }),
    );
    cache.get.mockResolvedValue({
      status: 'ready',
      platform: 'meta',
      query: 'other',
      countries: ['DE', 'FR'],
      advertisers: [],
    });
    await service.discover('org-a', query);
    expect(
      sources.findSavedDiscoverySources.mock.lastCall?.[0].cachedSourceIds,
    ).toEqual([]);
  });
  it('keeps omitted brand cache-only and strips source IDs and inferred observation', async () => {
    const { service, cache, sources } = setup();
    cache.get.mockResolvedValue({
      status: 'ready',
      platform: 'meta',
      query: 'coffee',
      countries: ['DE', 'FR'],
      advertisers: [
        {
          id: 'a',
          name: 'A',
          creativeCount: 1,
          countries: ['FR'],
          activeCreativeCount: 1,
          longevityDays: 900,
          samples: [
            {
              id: 'ad',
              adPerformanceId: 'foreign',
              observedAt: '2026-01-01',
              freshness: 'saved',
              imageUrls: ['https://example.com/a.jpg'],
              videoUrls: [],
              mediaUrls: [],
            },
          ],
        },
      ],
    });
    const result = await service.discover('org-a', {
      ...query,
      brandId: undefined,
    });
    expect(sources.findSavedDiscoverySources).not.toHaveBeenCalled();
    expect(result.advertisers[0].samples[0]).toMatchObject({
      freshness: 'unknown',
    });
    expect(result.advertisers[0].samples[0].adPerformanceId).toBeUndefined();
    expect(result.advertisers[0].samples[0].observedAt).toBeUndefined();
    expect(result.advertisers[0].activeCreativeCount).toBeUndefined();
    expect(result.advertisers[0].longevityDays).toBeUndefined();
  });
  it.each([null, 'invalid', '2999-01-01'])(
    'never invents observation for %s',
    async (observed) => {
      const { service, sources } = setup();
      sources.findSavedDiscoverySources.mockResolvedValue([
        { ...row, researchObservedAt: observed },
      ]);
      const result = await service.discover('org', query);
      expect(result.advertisers[0].samples[0]).toMatchObject({
        freshness: 'unknown',
        adPerformanceId: 'saved-id',
      });
      expect(result.advertisers[0].longevityDays).toBeUndefined();
      expect(result.advertisers[0].activeCreativeCount).toBeUndefined();
    },
  );
  it('retains stale identity and reports truthful bounded misses', async () => {
    const { service, sources } = setup();
    sources.findSavedDiscoverySources
      .mockResolvedValueOnce([{ ...row, researchFreshnessState: 'stale' }])
      .mockResolvedValueOnce([]);
    expect(
      (await service.discover('org', query)).advertisers[0].samples[0],
    ).toMatchObject({ freshness: 'stale', adPerformanceId: 'saved-id' });
    expect(await service.discover('org', query)).toMatchObject({
      status: 'empty',
      reason: 'no_matching_saved_ads',
    });
  });
  it('retains validation and direct grouping behavior', () => {
    expect(validateDiscoveryQuery(query).normalizedCountries).toEqual([
      'DE',
      'FR',
    ]);
    expect(() => validateDiscoveryQuery({ ...query, limit: NaN })).toThrow();
    const record = normalizeMetaArchiveRecord({
      adArchiveID: '1',
      pageID: '2',
      snapshot: { pageName: 'Example' },
    });
    if (!record) throw new Error('fixture');
    expect(
      groupDiscoveryAdvertisers([record, record], AdsPlatform.META)[0]
        .creativeCount,
    ).toBe(1);
  });
  it('rejects unsupported creative formats', () => {
    expect(() =>
      validateDiscoveryQuery({
        ...query,
        mediaType: 'text',
      } as unknown as typeof query),
    ).toThrow();
  });
  it('retains every creative returned for an advertiser', () => {
    const records = Array.from({ length: 6 }, (_, index) =>
      normalizeMetaArchiveRecord({
        adArchiveID: String(index),
        pageID: '456',
        snapshot: {
          pageName: 'Example',
          images: [{ originalImageUrl: 'https://example.com/image.jpg' }],
        },
      }),
    );
    const normalized = records.filter((record) => record !== undefined);
    expect(
      groupDiscoveryAdvertisers(normalized, AdsPlatform.META)[0].samples,
    ).toHaveLength(6);
  });
  it('normalizes and rejects invalid runtime query values', () => {
    expect(validateDiscoveryQuery(query)).toMatchObject({
      keyword: 'coffee',
      normalizedCountries: ['DE', 'FR'],
    });
    for (const invalid of [
      { keyword: 'x' },
      { limit: NaN },
      { limit: 51 },
      { limit: 1 },
      { countries: 'XX' },
      { countries: ['US'] },
      { platform: 'bad' },
    ])
      expect(() =>
        validateDiscoveryQuery({ ...query, ...invalid } as typeof query),
      ).toThrow();
    expect(() =>
      validateDiscoveryQuery({
        ...query,
        platform: AdsPlatform.TIKTOK,
        countries: 'US',
      }),
    ).toThrow();
    expect(() =>
      validateDiscoveryQuery({
        ...query,
        platform: AdsPlatform.GOOGLE,
        keyword: 'coffee shop',
      }),
    ).toThrow();
    expect(
      validateDiscoveryQuery({
        ...query,
        platform: AdsPlatform.GOOGLE,
        keyword: 'https://Example.com/foo',
      }).keyword,
    ).toBe('example.com');
  });
  it('groups and deduplicates without manufacturing active status or reach', () => {
    const record = normalizeMetaArchiveRecord({
      adArchiveID: '123',
      pageID: '456',
      snapshot: { pageName: 'Example' },
    });
    if (!record) throw new Error('Fixture did not normalize');
    const groups = groupDiscoveryAdvertisers(
      [record, record],
      AdsPlatform.META,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      creativeCount: 1,
      watchInput: { advertiserHandle: '456', externalAdvertiserId: '456' },
    });
    expect(groups[0].activeCreativeCount).toBeUndefined();
    expect(groups[0].reachEstimateMin).toBeUndefined();
  });
  it.each([undefined, [], ['France'], ['DE']])(
    'does not infer omitted-brand country evidence from request %j',
    async (countries) => {
      const { service, cache } = setup();
      cache.get.mockResolvedValue({
        status: 'ready',
        platform: 'meta',
        query: 'coffee',
        countries: ['FR'],
        advertisers: [
          {
            id: 'a',
            name: 'A',
            countries,
            samples: [
              {
                id: 'ad',
                imageUrls: ['https://example.com/a'],
                videoUrls: [],
                mediaUrls: [],
              },
            ],
          },
        ],
      });
      expect(
        (
          await service.discover('org', {
            ...query,
            brandId: undefined,
            countries: 'FR',
          })
        ).status,
      ).toBe('empty');
    },
  );
  it.each(['2999-01-01', '2025-12-01', 'invalid'])(
    'omits unobserved duration for invalid or scheduled end %s',
    async (end) => {
      const { service, sources } = setup();
      sources.findSavedDiscoverySources.mockResolvedValue([
        { ...row, researchObservedAt: undefined, presentationEndDate: end },
      ]);
      expect(
        (await service.discover('org', query)).advertisers[0].longevityDays,
      ).toBeUndefined();
    },
  );
  it('bounds completed unobserved duration by actual end', async () => {
    const { service, sources } = setup();
    sources.findSavedDiscoverySources.mockResolvedValue([
      {
        ...row,
        researchObservedAt: undefined,
        presentationEndDate: '2026-01-06',
      },
    ]);
    expect(
      (await service.discover('org', query)).advertisers[0].longevityDays,
    ).toBe(5);
  });
});
