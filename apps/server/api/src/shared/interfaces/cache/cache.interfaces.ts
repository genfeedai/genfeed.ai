import type { RequestWithBody } from '@libs/interfaces/http.interface';

/**
 * Cache configuration options for the @Cache decorator
 */
export interface CacheOptions {
  /**
   * Time to live in seconds
   * Defaults to 0 (cache disabled) to prevent stale data issues
   */
  ttl?: number;

  /**
   * Cache tags for invalidation
   */
  tags?: string[];

  /**
   * Refuse to store a response when one of its `tags` was invalidated while
   * the handler was running. A read that raced the invalidation holds the
   * pre-invalidation state, so storing it would bring back content the
   * invalidation just removed. Use it where a stale hit exposes content that
   * must not be readable any more (public brand and post responses).
   */
  isInvalidationGuarded?: boolean;

  /**
   * Custom key generator function
   * Receives the underlying Express request
   */
  keyGenerator?: (request: RequestWithBody) => string;

  /**
   * Whether to cache null/undefined results
   */
  cacheNullValues?: boolean;

  /**
   * Condition function to determine if result should be cached
   */
  condition?: (result: unknown) => boolean;
}

/**
 * Enhanced cache configuration for the @Cache decorator
 * Works with RedisCacheInterceptor for automatic caching
 */
export interface CacheConfig extends CacheOptions {
  /**
   * Namespace for the cache key (deprecated - use keyGenerator instead)
   */
  namespace?: string;
}
