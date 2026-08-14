import { ExternalApiCacheUtil } from '@api/shared/utils/external-api-cache/external-api-cache.util';
import { describe, expect, it, vi } from 'vitest';

describe('ExternalApiCacheUtil', () => {
  it('builds a prefixed key and hashes params without nullish values', () => {
    expect(ExternalApiCacheUtil.buildCacheKey('twitter', 'abc')).toBe(
      'twitter:abc',
    );

    const first = ExternalApiCacheUtil.generateCacheKey({
      limit: 10,
      q: 'cats',
      skip: undefined,
    });
    const second = ExternalApiCacheUtil.generateCacheKey({
      q: 'cats',
      limit: 10,
      unused: null,
    });

    expect(first).toHaveLength(32);
    expect(first).toBe(second);
    expect(first).not.toBe(
      ExternalApiCacheUtil.generateCacheKey({ limit: 10, q: 'dogs' }),
    );
  });

  it('returns the API result without touching cache when no cache service is provided', async () => {
    const apiCall = vi.fn().mockResolvedValue({ id: '1' });

    await expect(
      ExternalApiCacheUtil.withCache(
        undefined,
        undefined,
        { serviceName: 'twitter' },
        'key',
        apiCall,
      ),
    ).resolves.toEqual({ id: '1' });
    expect(apiCall).toHaveBeenCalledOnce();
  });

  it('returns a cache hit and skips the API call', async () => {
    const apiCall = vi.fn();
    const cacheService = {
      get: vi.fn().mockResolvedValue({ cached: true }),
      set: vi.fn(),
    };
    const logger = { debug: vi.fn(), warn: vi.fn() };

    await expect(
      ExternalApiCacheUtil.withCache(
        cacheService as never,
        logger as never,
        { serviceName: 'twitter' },
        'lookup',
        apiCall,
      ),
    ).resolves.toEqual({ cached: true });
    expect(apiCall).not.toHaveBeenCalled();
    expect(cacheService.get).toHaveBeenCalledWith('twitter:lookup');
  });

  it('caches a miss and rethrows after optionally caching the error', async () => {
    const cacheService = {
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { debug: vi.fn(), warn: vi.fn() };

    await expect(
      ExternalApiCacheUtil.withCache(
        cacheService as never,
        logger as never,
        { serviceName: 'twitter', ttl: 12 },
        'lookup',
        async () => ({ id: 'fresh' }),
      ),
    ).resolves.toEqual({ id: 'fresh' });
    expect(cacheService.set).toHaveBeenCalledWith(
      'twitter:lookup',
      { id: 'fresh' },
      { tags: ['external-api', 'twitter'], ttl: 12 },
    );

    cacheService.set.mockClear();
    await expect(
      ExternalApiCacheUtil.withCache(
        cacheService as never,
        logger as never,
        { cacheErrors: true, serviceName: 'twitter' },
        'lookup',
        async () => {
          throw new Error('upstream down');
        },
      ),
    ).rejects.toThrow('upstream down');
    expect(cacheService.set).toHaveBeenCalledWith(
      'twitter:lookup',
      { cached: true, error: 'upstream down' },
      { ttl: 60 },
    );

    await ExternalApiCacheUtil.invalidateServiceCache(
      cacheService as never,
      'twitter',
    );
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['twitter']);
  });

  it('wraps a method so repeated calls share a generated cache key', async () => {
    const original = vi.fn().mockResolvedValue('ok');
    const cacheService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const cached = ExternalApiCacheUtil.createCachedMethod(
      original,
      cacheService as never,
      undefined,
      { serviceName: 'twitter' },
    );

    await expect(cached('one')).resolves.toBe('ok');
    expect(original).toHaveBeenCalledWith('one');
    expect(cacheService.get).toHaveBeenCalledWith(
      expect.stringMatching(/^twitter:[0-9a-f]{32}$/u),
    );
  });
});
