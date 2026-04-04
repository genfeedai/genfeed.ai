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

/**
 * Simplified cache options for service-level caching
 */
export interface ServiceCacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}
