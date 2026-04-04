/**
 * Canonical Redis cache key patterns for all collections.
 *
 * Key convention:
 *   list  → `{collection}:list:{orgId}`
 *   single → `{collection}:single:{id}`
 *
 * Tag convention (matches @Cache decorator tags):
 *   list + single are both tagged with the collection name (e.g. `brands`)
 *   so invalidateByTags([CACHE_TAGS.BRANDS]) busts both in one call.
 *
 * When adding a new collection:
 * 1. Add its patterns here
 * 2. Add its tag constant
 * 3. Inject CacheInvalidationService and call invalidate() on writes
 * 4. See CLAUDE.md → Cache Invalidation Pattern
 */
export const CACHE_PATTERNS = {
  BRANDS_LIST: (orgId: string) => `brands:list:${orgId}`,
  BRANDS_SINGLE: (id: string) => `brands:single:${id}`,
  CREDITS_BYOK: (orgId: string) => `credits:byok:${orgId}`,
  CREDITS_LAST_PURCHASE_BASELINE: (orgId: string) =>
    `credits:last-purchase-baseline:${orgId}`,
  CREDITS_USAGE: (orgId: string) => `credits:usage:${orgId}`,
} as const;

/**
 * Tag names that correspond to the tags passed to @Cache({ tags: [...] }).
 * Invalidating a tag busts all cache entries that were stored under that tag.
 */
export const CACHE_TAGS = {
  BRANDS: 'brands',
  CREDITS: 'credits',
} as const;
