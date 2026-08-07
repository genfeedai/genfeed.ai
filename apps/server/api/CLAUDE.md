## Cache Invalidation Pattern

### The problem this solves
`BaseService.create()` invalidates `query:{collection}` and `collection:{collection}` Redis tags.
The HTTP-level `@Cache` decorator on list endpoints uses tag `{collection}` (e.g. `brands`), so newly created
records were invisible in list responses until the cache TTL expired (up to 30 minutes).

`patch()` and `remove()` invalidate the same full four-tag set (`collectionName`, `collection:{name}`, `query:{name}`, `query:paginated:{name}`).

### Fix applied (BaseService)
`BaseService.create()` now invalidates the same set of tags as `patch()` and `remove()`:
```
collectionName, collection:{name}, query:{name}, query:paginated:{name}
```

### Paginated-query cache tag is scoped per collection
`query:paginated:{name}` (via `paginatedQueryCacheTag(collection)` in
`src/shared/utils/query-cache/query-cache.util.ts`) replaces the old global
`query:paginated` tag. Every `create`/`patch`/`remove` write used to
invalidate the bare `query:paginated` tag, which busted every collection's
cached paginated list on any write anywhere — collapsing cache hit rate
system-wide under write load. Per-write invalidation must always use
`paginatedQueryCacheTag(collection)`, scoped to the collection that changed.

`findAll()` tags each cached page with both the scoped tag and the reserved
`GLOBAL_PAGINATED_QUERY_CACHE_TAG` (`query:paginated:all`). The global tag
exists only for deliberate system-wide flushes via
`invalidateAllPaginatedQueryCaches()` — currently used by
`ArticlesService.generateArticles()`, since batch article generation can
affect cross-collection surfaces. Never invalidate the global tag from a
per-collection write path; that reintroduces the cache stampede this fixes.

### When adding Redis caching to a new service

1. Use consistent key format: `{collection}:list:{orgId}`, `{collection}:single:{id}`
2. Register the patterns in `src/common/constants/cache-patterns.constants.ts`
3. Add the tag name in `CACHE_TAGS`
4. On any write (create/update/delete), inject `CacheInvalidationService` and call:
   ```typescript
   await this.cacheInvalidationService.invalidate(
     CACHE_PATTERNS.BRANDS_LIST(orgId),
     CACHE_PATTERNS.BRANDS_SINGLE(id),
   );
   ```
5. Test: verify write → list reflects change immediately (no stale cache)

### Services involved
- `CacheService` — tag-based get/set/invalidate (prefer this for most cases)
- `CacheInvalidationService` — direct key + pattern (SCAN+UNLINK) busting for explicit keys
- `CacheTagsService` — internal: maintains tag→key sets in Redis
- `RedisCacheInterceptor` + `@Cache()` decorator — HTTP-level response caching with tags

### BrandsService reference implementation
- `create()` → invalidates `CACHE_PATTERNS.BRANDS_LIST(orgId)` + pattern `brands:*`
- `patch()` → invalidates `CACHE_PATTERNS.BRANDS_SINGLE(id)` (list handled by BaseService)
- `remove()` → invalidates `CACHE_PATTERNS.BRANDS_SINGLE(id)` (list handled by BaseService)
