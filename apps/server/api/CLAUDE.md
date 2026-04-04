## Cache Invalidation Pattern

### The problem this solves
`BaseService.create()` was only busting `agg:{collection}` and `collection:{collection}` Redis tags.
The HTTP-level `@Cache` decorator on list endpoints uses tag `{collection}` (e.g. `brands`), so newly created
records were invisible in list responses until the cache TTL expired (up to 30 minutes).

`patch()` and `remove()` were already correct — they invalidate the bare collection tag.

### Fix applied (BaseService)
`BaseService.create()` now invalidates the same set of tags as `patch()` and `remove()`:
```
collectionName, collection:{name}, agg:{name}, agg:paginated
```

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
