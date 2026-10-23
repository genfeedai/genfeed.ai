import {
  type ArticleQueryCachePorts,
  invalidateArticleListCaches,
} from '@api/collections/articles/utils/article-query-cache.util';
import { describe, expect, it, vi } from 'vitest';

function ports() {
  return {
    cacheInvalidationService: {
      invalidate: vi.fn().mockResolvedValue(undefined),
      invalidateByTags: vi.fn().mockResolvedValue(1),
    },
    cacheService: { invalidateByTags: vi.fn().mockResolvedValue(3) },
    collectionName: 'article',
    logger: { debug: vi.fn() },
    source: 'ArticlesService',
  } satisfies ArticleQueryCachePorts;
}
const tags = [
  'articles',
  'article',
  'collection:article',
  'query:article',
  'query:paginated:article',
];

describe('article query cache invalidation', () => {
  it('invalidates canonical org/id keys before each independent tag layer', async () => {
    const deps = ports();
    await invalidateArticleListCaches(
      'update',
      { articleId: 'article-1', organizationId: 'org-1' },
      deps,
    );
    expect(deps.cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      'articles:list:org-1',
      'articles:single:article-1',
    );
    expect(deps.cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith(
      ['articles'],
    );
    expect(deps.cacheService.invalidateByTags).toHaveBeenCalledWith(tags);
    expect(
      deps.cacheInvalidationService.invalidate.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.cacheInvalidationService.invalidateByTags.mock
        .invocationCallOrder[0],
    );
    expect(
      deps.cacheInvalidationService.invalidateByTags.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      deps.cacheService.invalidateByTags.mock.invocationCallOrder[0],
    );
    expect(deps.logger.debug).toHaveBeenCalledWith(
      'ArticlesService invalidated 3 cache keys after update',
      { tags },
    );
  });
  it('adds the public tag only when requested and retains collection scoping', async () => {
    const deps = ports();
    await invalidateArticleListCaches('publish', { includePublic: true }, deps);
    expect(deps.cacheService.invalidateByTags).toHaveBeenCalledWith([
      ...tags,
      'public',
    ]);
    expect(deps.cacheService.invalidateByTags.mock.calls[0][0]).not.toContain(
      'query:paginated:all',
    );
    expect(deps.cacheInvalidationService.invalidate).not.toHaveBeenCalled();
  });
  it('keeps tag-only invalidation when there are no explicit keys', async () => {
    const deps = ports();
    await invalidateArticleListCaches('create', {}, deps);
    expect(deps.cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    expect(deps.cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith(
      ['articles'],
    );
  });
  it('supports either optional cache layer independently', async () => {
    const deps = ports();
    await invalidateArticleListCaches(
      'delete',
      { articleId: 'article-1' },
      { ...deps, cacheService: undefined },
    );
    expect(deps.cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      'articles:single:article-1',
    );
    expect(deps.logger.debug).not.toHaveBeenCalled();
    await invalidateArticleListCaches(
      'create',
      {},
      { ...deps, cacheInvalidationService: undefined },
    );
    expect(deps.cacheService.invalidateByTags).toHaveBeenCalledWith(tags);
  });
  it('does nothing when both optional layers are absent', async () => {
    const deps = ports();
    await invalidateArticleListCaches(
      'create',
      {},
      {
        collectionName: deps.collectionName,
        logger: deps.logger,
        source: deps.source,
      },
    );
    expect(deps.logger.debug).not.toHaveBeenCalled();
  });
  it('propagates a key-invalidation error before subsequent tag work', async () => {
    const deps = ports();
    const error = new Error('synthetic cache failure');
    deps.cacheInvalidationService.invalidate.mockRejectedValue(error);
    await expect(
      invalidateArticleListCaches('update', { organizationId: 'org-1' }, deps),
    ).rejects.toBe(error);
    expect(
      deps.cacheInvalidationService.invalidateByTags,
    ).not.toHaveBeenCalled();
    expect(deps.cacheService.invalidateByTags).not.toHaveBeenCalled();
  });
  it('propagates a tag-layer error without logging success', async () => {
    const deps = ports();
    const error = new Error('synthetic tag failure');
    deps.cacheService.invalidateByTags.mockRejectedValue(error);
    await expect(invalidateArticleListCaches('update', {}, deps)).rejects.toBe(
      error,
    );
    expect(deps.logger.debug).not.toHaveBeenCalled();
  });
});
