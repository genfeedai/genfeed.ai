import {
  type ArticleQueryCachePorts,
  invalidateArticleListCaches,
} from '@api/collections/articles/utils/article-query-cache.util';
import { beforeEach, describe, expect, it } from 'vitest';

const collectionTags = [
  'articles',
  'article',
  'collection:article',
  'query:article',
  'query:paginated:article',
];

describe('article query cache invalidation', () => {
  // The cached entries both layers can evict, and what each layer did in order.
  let entries: Map<string, string[]>;
  let operations: string[];
  let debugLogs: Array<{ context: unknown; message: string }>;
  let failure: { keys?: Error; tags?: Error };
  let ports: Required<ArticleQueryCachePorts>;

  const evictTagged = (tags: string[]) => {
    const evicted = [...entries].filter(([, entryTags]) =>
      entryTags.some((tag) => tags.includes(tag)),
    );
    for (const [key] of evicted) {
      entries.delete(key);
    }
    return evicted.length;
  };

  beforeEach(() => {
    entries = new Map([
      ['articles:list:org-1', []],
      ['articles:list:org-2', []],
      ['articles:single:article-1', []],
      ['http:/articles?org=org-1', ['articles']],
      ['query:article:page-1', ['query:paginated:article']],
      ['public:articles', ['public']],
      ['query:post:page-1', ['query:paginated:post']],
    ]);
    operations = [];
    debugLogs = [];
    failure = {};

    ports = {
      cacheInvalidationService: {
        invalidate: async (...keys: string[]) => {
          operations.push(`keys:${keys.join(',')}`);
          if (failure.keys) throw failure.keys;
          for (const key of keys) {
            entries.delete(key);
          }
        },
        invalidateByTags: async (tags: string[]) => {
          operations.push(`invalidation-tags:${tags.join(',')}`);
          return evictTagged(tags);
        },
      },
      cacheService: {
        invalidateByTags: async (tags: string[]) => {
          operations.push(`cache-tags:${tags.join(',')}`);
          if (failure.tags) throw failure.tags;
          return evictTagged(tags);
        },
      },
      collectionName: 'article',
      logger: {
        debug: (message: string, context?: unknown) => {
          debugLogs.push({ context, message });
        },
      },
      source: 'ArticlesService',
    } as Required<ArticleQueryCachePorts>;
  });

  it('invalidates canonical org/id keys before each independent tag layer', async () => {
    await invalidateArticleListCaches(
      'update',
      { articleId: 'article-1', organizationId: 'org-1' },
      ports,
    );

    expect(operations).toEqual([
      'keys:articles:list:org-1,articles:single:article-1',
      'invalidation-tags:articles',
      `cache-tags:${collectionTags.join(',')}`,
    ]);
    expect([...entries.keys()]).toEqual([
      'articles:list:org-2',
      'public:articles',
      'query:post:page-1',
    ]);
    expect(debugLogs).toEqual([
      {
        context: { tags: collectionTags },
        message: 'ArticlesService invalidated 1 cache keys after update',
      },
    ]);
  });

  it('evicts public pages only when requested and keeps other collections cached', async () => {
    await invalidateArticleListCaches(
      'publish',
      { includePublic: true },
      ports,
    );

    expect(operations.at(-1)).toBe(
      `cache-tags:${[...collectionTags, 'public'].join(',')}`,
    );
    expect(entries.has('public:articles')).toBe(false);
    expect(entries.has('query:post:page-1')).toBe(true);
  });

  it('keeps tag-only invalidation when there are no explicit keys', async () => {
    await invalidateArticleListCaches('create', {}, ports);

    expect(operations).toEqual([
      'invalidation-tags:articles',
      `cache-tags:${collectionTags.join(',')}`,
    ]);
    expect(entries.has('articles:list:org-1')).toBe(true);
  });

  it('busts canonical keys with only the invalidation layer present', async () => {
    await invalidateArticleListCaches(
      'delete',
      { articleId: 'article-1' },
      { ...ports, cacheService: undefined },
    );

    expect(operations).toEqual([
      'keys:articles:single:article-1',
      'invalidation-tags:articles',
    ]);
    expect(debugLogs).toEqual([]);
  });

  it('busts the collection tags with only the tag cache present', async () => {
    await invalidateArticleListCaches(
      'create',
      {},
      { ...ports, cacheInvalidationService: undefined },
    );

    expect(operations).toEqual([`cache-tags:${collectionTags.join(',')}`]);
  });

  it('does nothing when both optional layers are absent', async () => {
    await invalidateArticleListCaches(
      'create',
      {},
      {
        collectionName: ports.collectionName,
        logger: ports.logger,
        source: ports.source,
      },
    );

    expect(operations).toEqual([]);
    expect(entries.size).toBe(7);
    expect(debugLogs).toEqual([]);
  });

  it('propagates a key-invalidation error before subsequent tag work', async () => {
    failure.keys = new Error('synthetic cache failure');

    await expect(
      invalidateArticleListCaches('update', { organizationId: 'org-1' }, ports),
    ).rejects.toBe(failure.keys);
    expect(operations).toEqual(['keys:articles:list:org-1']);
  });

  it('propagates a tag-layer error without logging success', async () => {
    failure.tags = new Error('synthetic tag failure');

    await expect(invalidateArticleListCaches('update', {}, ports)).rejects.toBe(
      failure.tags,
    );
    expect(debugLogs).toEqual([]);
  });
});
