import { createHash } from 'node:crypto';
import {
  GLOBAL_PAGINATED_QUERY_CACHE_TAG,
  generateQueryCacheKey,
  invalidateAllPaginatedQueryCaches,
  invalidateCollectionQueryCache,
  paginatedQueryCacheTag,
} from '@api/shared/utils/query-cache/query-cache.util';
import { describe, expect, it, vi } from 'vitest';

describe('query-cache.util', () => {
  it('hashes collection + query + options into a stable key', () => {
    const query = { brandId: 'brand-1', page: 2 };
    const options = { limit: 20 };
    const expectedHash = createHash('sha256')
      .update('posts')
      .update(JSON.stringify(query))
      .update(JSON.stringify(options))
      .digest('hex');

    expect(generateQueryCacheKey('posts', query, options)).toBe(
      `query:posts:${expectedHash}`,
    );
    expect(generateQueryCacheKey('posts', query, options)).toBe(
      generateQueryCacheKey('posts', query, options),
    );
    expect(generateQueryCacheKey('posts', query)).not.toBe(
      generateQueryCacheKey('posts', query, options),
    );
  });

  it('scopes paginated tags per collection', () => {
    expect(paginatedQueryCacheTag('posts')).toBe('query:paginated:posts');
    expect(paginatedQueryCacheTag('brands')).toBe('query:paginated:brands');
    expect(GLOBAL_PAGINATED_QUERY_CACHE_TAG).toBe('query:paginated:all');
  });

  it('invalidates only the requested collection tags on a write', async () => {
    const cacheService = {
      invalidateByTags: vi
        .fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3),
    };

    await expect(
      invalidateCollectionQueryCache(cacheService as never, 'posts'),
    ).resolves.toBe(5);
    expect(cacheService.invalidateByTags).toHaveBeenNthCalledWith(1, [
      'query:posts',
    ]);
    expect(cacheService.invalidateByTags).toHaveBeenNthCalledWith(2, [
      'collection:posts',
    ]);
  });

  it('reserves the global paginated tag for deliberate flushes', async () => {
    const cacheService = {
      invalidateByTags: vi.fn().mockResolvedValue(9),
    };

    await expect(
      invalidateAllPaginatedQueryCaches(cacheService as never),
    ).resolves.toBe(9);
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
      GLOBAL_PAGINATED_QUERY_CACHE_TAG,
    ]);
  });
});
