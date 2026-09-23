import type { CacheService } from '@api/services/cache/cache.service';
import type { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { normalizeMetaArchiveRecord } from '@genfeedai/integrations/ads';
import { describe, expect, it, vi } from 'vitest';
import {
  AdsDiscoveryService,
  groupDiscoveryAdvertisers,
  validateDiscoveryQuery,
} from './ads-discovery.service';

describe('public discovery', () => {
  const query = {
    keyword: ' coffee ',
    platform: AdsPlatform.META,
    countries: 'fr,DE,FR',
    limit: 24,
  };
  function setup() {
    const data = new Map<string, unknown>(),
      claims = new Set<string>();
    const fetchCreatives = vi.fn().mockResolvedValue([]);
    const adapter = {
      fetchCreatives,
      getReadiness: vi.fn().mockReturnValue({
        available: true,
        blockers: [],
        documentationUrl: 'https://example.com',
      }),
    };
    const cache = {
      get: vi.fn(async (key: string) => data.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        data.set(key, value);
        return true;
      }),
      claimOnce: vi.fn(
        async (
          key: string,
        ): Promise<'claimed' | 'duplicate' | 'unavailable'> => {
          if (claims.has(key)) return 'duplicate';
          claims.add(key);
          return 'claimed';
        },
      ),
    };
    const service = new AdsDiscoveryService(
      { resolve: () => adapter } as unknown as PaidCreativeProviderRegistry,
      cache as unknown as CacheService,
    );
    return { service, cache, adapter, data };
  }
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
  it('claims before spending, caches empty outcomes for 24h and isolates tenants', async () => {
    const { service, adapter, cache } = setup();
    expect((await service.discover('org-a', query)).status).toBe('pending');
    await vi.waitFor(() =>
      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'empty' }),
        { ttl: 86400 },
      ),
    );
    expect((await service.discover('org-a', query)).status).toBe('empty');
    expect(adapter.fetchCreatives).toHaveBeenCalledTimes(1);
    await service.discover('org-b', query);
    expect(adapter.fetchCreatives).toHaveBeenCalledTimes(2);
  });
  it('does not run concurrent duplicate searches', async () => {
    const { service, adapter } = setup();
    adapter.fetchCreatives.mockImplementation(() => new Promise(() => {}));
    await Promise.all([
      service.discover('org', query),
      service.discover('org', query),
    ]);
    expect(adapter.fetchCreatives).toHaveBeenCalledTimes(1);
  });
  it('does not spend without cache or configuration and does not cache source failures as empty', async () => {
    const { service, adapter, cache } = setup();
    cache.claimOnce.mockResolvedValue('unavailable');
    expect((await service.discover('org', query)).reason).toBe(
      'paid_creative_cache_unavailable',
    );
    expect(adapter.fetchCreatives).not.toHaveBeenCalled();
    adapter.getReadiness.mockReturnValue({
      available: false,
      blockers: ['paid_creative_apify_token_missing'],
      documentationUrl: 'https://example.com',
    });
    expect((await service.discover('org', query)).reason).toBe(
      'paid_creative_apify_token_missing',
    );
    const failing = setup();
    failing.adapter.fetchCreatives.mockRejectedValue(new Error('secret-token'));
    await failing.service.discover('org', query);
    await vi.waitFor(() =>
      expect(failing.cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'unavailable',
          reason: 'paid_creative_source_unavailable',
        }),
        { ttl: 60 },
      ),
    );
  });
  it('reports an interrupted job after process restart without rerunning it', async () => {
    const { service, adapter, data } = setup();
    adapter.fetchCreatives.mockImplementation(() => new Promise(() => {}));
    await service.discover('org', query);
    const key = [...data.keys()][0];
    data.set(key, {
      ...(data.get(key) as object),
      expiresAt: '2000-01-01T00:00:00Z',
    });
    expect((await service.discover('org', query)).reason).toBe(
      'paid_creative_search_interrupted',
    );
    expect(adapter.fetchCreatives).toHaveBeenCalledTimes(1);
  });
});
