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
  API_KEYS_LIST: (orgId: string) => `apiKeys:list:${orgId}`,
  API_KEYS_SINGLE: (id: string) => `apiKeys:single:${id}`,
  ARTICLES_LIST: (orgId: string) => `articles:list:${orgId}`,
  ARTICLES_SINGLE: (id: string) => `articles:single:${id}`,
  BRANDS_LIST: (orgId: string) => `brands:list:${orgId}`,
  BRANDS_SINGLE: (id: string) => `brands:single:${id}`,
  CREDITS_BYOK: (orgId: string) => `credits:byok:${orgId}`,
  CREDITS_LAST_PURCHASE_BASELINE: (orgId: string) =>
    `credits:last-purchase-baseline:${orgId}`,
  CREDITS_USAGE: (orgId: string) => `credits:usage:${orgId}`,
  DASHBOARD_LAYOUTS_LIST: (orgId: string) => `dashboardLayouts:list:${orgId}`,
  DASHBOARD_LAYOUTS_SINGLE: (id: string) => `dashboardLayouts:single:${id}`,
  LISTENING_TOPICS_LIST: (orgId: string) => `listeningTopics:list:${orgId}`,
  LISTENING_TOPICS_SINGLE: (id: string) => `listeningTopics:single:${id}`,
} as const;

/**
 * Tag names that correspond to the tags passed to @Cache({ tags: [...] }).
 * Invalidating a tag busts all cache entries that were stored under that tag.
 */
export const CACHE_TAGS = {
  API_KEYS: 'apiKeys',
  ARTICLES: 'articles',
  BRANDS: 'brands',
  CREDITS: 'credits',
  DASHBOARD_LAYOUTS: 'dashboardLayouts',
  LISTENING_TOPICS: 'listeningTopics',
} as const;
