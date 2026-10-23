import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { CacheService } from '@api/services/cache/cache.service';
import { paginatedQueryCacheTag } from '@api/shared/utils/query-cache/query-cache.util';
import type { LoggerService } from '@libs/logger/logger.service';

export type ArticleQueryCachePorts = {
  cacheInvalidationService?: Pick<
    CacheInvalidationService,
    'invalidate' | 'invalidateByTags'
  >;
  cacheService?: Pick<CacheService, 'invalidateByTags'>;
  collectionName: string;
  logger: Pick<LoggerService, 'debug'>;
  source: string;
};

/**
 * Invalidate the article cache after a write.
 * Single home for the tag block previously copy-pasted across
 * createArticle/update/removeArticle.
 *
 * Busts two layers: (1) the canonical `articles:list:{orgId}` /
 * `articles:single:{id}` keys plus the shared `articles` tag via
 * CacheInvalidationService — without these, HTTP `@Cache` responses keyed by
 * org/id can go stale after a write — and (2) the legacy tag set on the
 * tag-based CacheService. See api CLAUDE.md → Cache Invalidation Pattern.
 *
 * @param context - the write that triggered invalidation (used in the debug log)
 * @param options.includePublic - also bust the `public` tag (published articles)
 * @param options.organizationId - bust this org's `articles:list:{orgId}` key
 * @param options.articleId - bust this article's `articles:single:{id}` key
 */
export async function invalidateArticleListCaches(
  context: string,
  options: {
    includePublic?: boolean;
    organizationId?: string;
    articleId?: string;
  },
  ports: ArticleQueryCachePorts,
): Promise<void> {
  const { includePublic = false, organizationId, articleId } = options;

  if (ports.cacheInvalidationService) {
    const keys: string[] = [];
    if (organizationId) {
      keys.push(CACHE_PATTERNS.ARTICLES_LIST(organizationId));
    }
    if (articleId) {
      keys.push(CACHE_PATTERNS.ARTICLES_SINGLE(articleId));
    }

    if (keys.length > 0) {
      await ports.cacheInvalidationService.invalidate(...keys);
    }
    // Bust org/user-scoped @Cache responses registered under the shared
    // articles tag at set time. Idempotent with the CacheService tag pass
    // below — both run so each optional dependency stays self-sufficient.
    await ports.cacheInvalidationService.invalidateByTags([
      CACHE_TAGS.ARTICLES,
    ]);
  }

  if (!ports.cacheService) {
    return;
  }

  const collectionName = ports.collectionName;
  const tagsToInvalidate = [
    CACHE_TAGS.ARTICLES,
    collectionName,
    `collection:${collectionName}`,
    `query:${collectionName}`,
    paginatedQueryCacheTag(collectionName),
  ];

  if (includePublic) {
    tagsToInvalidate.push('public');
  }

  const invalidated =
    await ports.cacheService.invalidateByTags(tagsToInvalidate);
  ports.logger.debug(
    `${ports.source} invalidated ${invalidated} cache keys after ${context}`,
    { tags: tagsToInvalidate },
  );
}
