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
    let clock = 0;
    const data = new Map<string, unknown>();
    const resultExpiries = new Map<string, number>();
    const claims = new Map<string, { token: string; expiresAt: number }>();
    const owner = (key: string) => {
      const claim = claims.get(key);
      if (claim && claim.expiresAt <= clock) {
        claims.delete(key);
        return undefined;
      }
      return claim?.token;
    };
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
      get: vi.fn(async (key: string) => {
        if ((resultExpiries.get(key) ?? Infinity) <= clock) data.delete(key);
        return data.get(key) ?? null;
      }),
      acquireOwnedClaim: vi.fn(
        async (
          key: string,
          token: string,
          ttl: number,
        ): Promise<'claimed' | 'duplicate' | 'unavailable'> => {
          if (owner(key)) return 'duplicate';
          claims.set(key, { token, expiresAt: clock + ttl * 1000 });
          return 'claimed';
        },
      ),
      setOwnedClaimValue: vi.fn(
        async (
          claimKey: string,
          token: string,
          resultKey: string,
          value: unknown,
          ttl: number,
        ) => {
          if (owner(claimKey) !== token) return false;
          data.set(resultKey, value);
          resultExpiries.set(resultKey, clock + ttl * 1000);
          return true;
        },
      ),
      releaseOwnedClaim: vi.fn(
        async (claimKey: string, token: string, resultKeyToDelete?: string) => {
          if (owner(claimKey) !== token) return false;
          if (resultKeyToDelete) data.delete(resultKeyToDelete);
          claims.delete(claimKey);
          return true;
        },
      ),
    };
    const service = new AdsDiscoveryService(
      { resolve: () => adapter } as unknown as PaidCreativeProviderRegistry,
      cache as unknown as CacheService,
    );
    return {
      service,
      cache,
      adapter,
      data,
      claims,
      advance: (milliseconds: number) => {
        clock += milliseconds;
      },
    };
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
      expect(cache.setOwnedClaimValue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ status: 'empty' }),
        86400,
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
    cache.acquireOwnedClaim.mockResolvedValue('unavailable');
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
      expect(failing.cache.setOwnedClaimValue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          status: 'unavailable',
          reason: 'paid_creative_source_unavailable',
        }),
        60,
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
  it('allows immediate retry after writing pending fails', async () => {
    const { service, cache, adapter, data, claims } = setup();
    cache.setOwnedClaimValue.mockImplementationOnce(
      async (_claim, _token, key, value) => {
        data.set(key, value);
        return false;
      },
    );
    expect((await service.discover('org', query)).reason).toBe(
      'paid_creative_cache_unavailable',
    );
    expect(adapter.fetchCreatives).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
    expect(claims.size).toBe(0);
    expect((await service.discover('org', query)).status).toBe('pending');
    expect(adapter.fetchCreatives).toHaveBeenCalledTimes(1);
  });

  it('retries after the 60 second failure result expires without waiting 300 seconds', async () => {
    const { service, adapter, cache, claims, advance } = setup();
    adapter.fetchCreatives.mockRejectedValueOnce(new Error('provider failed'));
    await service.discover('org', query);
    await vi.waitFor(() => expect(claims.size).toBe(0));
    expect((await service.discover('org', query)).reason).toBe(
      'paid_creative_source_unavailable',
    );
    advance(61_000);
    expect((await service.discover('org', query)).status).toBe('pending');
    expect(adapter.fetchCreatives).toHaveBeenCalledTimes(2);
    expect(cache.acquireOwnedClaim).toHaveBeenCalledTimes(2);
  });

  it('rechecks a result completed between the initial miss and claim acquisition', async () => {
    const { service, adapter, cache, claims, data } = setup();
    const completed = { id: 'completed', status: 'empty', advertisers: [] };
    cache.get.mockImplementationOnce(async (key) => {
      data.set(key, completed);
      return null;
    });
    expect(await service.discover('org', query)).toBe(completed);
    expect(adapter.fetchCreatives).not.toHaveBeenCalled();
    expect(claims.size).toBe(0);
    expect([...data.values()]).toEqual([completed]);
  });

  it.each([false, true])(
    'keeps pending after terminal persistence failure (actor fails: %s) so polling does not spend again',
    async (actorFails) => {
      const { service, adapter, cache, claims } = setup();
      if (actorFails)
        adapter.fetchCreatives.mockRejectedValueOnce(
          new Error('source failed'),
        );
      const write = cache.setOwnedClaimValue.getMockImplementation();
      if (!write) throw new Error('Missing fixture writer');
      cache.setOwnedClaimValue.mockImplementation(async (...args) =>
        args[4] === (actorFails ? 60 : 86400) ? false : write(...args),
      );
      await service.discover('org', query);
      await vi.waitFor(() => expect(claims.size).toBe(0));
      expect((await service.discover('org', query)).status).toBe('pending');
      expect(adapter.fetchCreatives).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { oldFails: false, newFinished: false },
    { oldFails: true, newFinished: false },
    { oldFails: false, newFinished: true },
    { oldFails: true, newFinished: true },
  ])(
    'protects successor state when expired work completes: %o',
    async ({ oldFails, newFinished }) => {
      const { service, adapter, cache, claims, advance, data } = setup();
      let finishOld = () => {};
      let finishNew = () => {};
      const creative = normalizeMetaArchiveRecord({
        adArchiveID: 'new-ad',
        pageID: 'new-advertiser',
        snapshot: { pageName: 'New result' },
      });
      if (!creative) throw new Error('Invalid fixture');
      adapter.fetchCreatives
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              finishOld = () =>
                oldFails ? reject(new Error('old failure')) : resolve([]);
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishNew = () => resolve([creative]);
            }),
        );
      await service.discover('org', query);
      const oldToken = [...claims.values()][0].token;
      advance(301_000);
      await service.discover('org', query);
      const successor = [...claims.values()][0];
      expect(successor.token).not.toBe(oldToken);
      if (newFinished) {
        finishNew();
        await vi.waitFor(() => expect(claims.size).toBe(0));
      }
      const expected = [...data.values()][0];
      const releases = cache.releaseOwnedClaim.mock.calls.length;
      finishOld();
      await vi.waitFor(() =>
        expect(cache.releaseOwnedClaim.mock.calls.length).toBe(releases + 1),
      );
      expect([...data.values()][0]).toEqual(expected);
      if (!newFinished) {
        expect([...claims.values()][0]).toEqual(successor);
        finishNew();
        await vi.waitFor(() => expect(claims.size).toBe(0));
      }
      expect(adapter.fetchCreatives).toHaveBeenCalledTimes(2);
    },
  );
});
