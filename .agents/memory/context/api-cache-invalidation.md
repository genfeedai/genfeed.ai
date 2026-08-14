---
name: api cache invalidation
description: Redis tag-set invalidation for API list/detail caches
type: reference
---

# API cache invalidation

`BaseService.create()` / `patch()` / `remove()` invalidate the same four-tag
set: `collectionName`, `collection:{name}`, `query:{name}`,
`query:paginated:{name}`.

`query:paginated:{name}` comes from `paginatedQueryCacheTag(collection)` in
`apps/server/api/src/shared/utils/query-cache/query-cache.util.ts`. Do not
invalidate the bare `query:paginated` tag on a per-collection write — that
busts every cached paginated list.

`findAll()` tags each page with the scoped tag and
`GLOBAL_PAGINATED_QUERY_CACHE_TAG` (`query:paginated:all`). The global tag
exists only for `invalidateAllPaginatedQueryCaches()` — currently
`ArticlesService.generateArticles()`. Never flush it from a per-collection
write.

## New cached service

1. Keys: `{collection}:list:{orgId}`, `{collection}:single:{id}`
2. Register patterns in `cache-patterns.constants.ts` and add the tag in
   `CACHE_TAGS`
3. On write, inject `CacheInvalidationService` and invalidate those keys
4. Register tags at set time (`CacheService` `tags` option). Writes bust via
   `invalidateByTags`. Do not reintroduce SCAN/`invalidatePattern` on the
   request path.

Caches with several keys per org (agent brand context) use an org-scoped tag
from `SCOPED_CACHE_TAGS` (`brand-ctx:{orgId}`).
