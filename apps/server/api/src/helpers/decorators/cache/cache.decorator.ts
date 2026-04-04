import type { CacheConfig } from '@api/shared/interfaces/cache/cache.interfaces';
import { SetMetadata } from '@nestjs/common';

/**
 * Cache decorator for controller methods
 * Works with RedisCacheInterceptor to automatically cache API responses
 *
 * Default TTL is 0 (cache disabled) to prevent stale data issues.
 * Override by explicitly setting ttl in config if caching is needed.
 *
 * Usage:
 * @Get()
 * @Cache({
 *   ttl: 300, // 5 minutes - explicitly enable caching
 *   tags: ['users', 'profiles'],
 *   keyGenerator: (req) =>
 *     `user:${req.user?.id ?? 'anonymous'}:profile:${JSON.stringify(req.query)}`,
 * })
 * async findUserProfile(@CurrentUser() user: User, @Query() query: unknown) {
 *   return this.userService.getProfile(user.id);
 * }
 */
export function Cache(config: CacheConfig) {
  // Default TTL to 0 (cache disabled) to prevent stale cache issues
  // All caching is disabled globally - override by explicitly setting ttl > 0 if needed
  const configWithDefaults: CacheConfig = {
    ...config,
    ttl: config.ttl ?? 0,
  };
  return SetMetadata('cache', configWithDefaults);
}

/**
 * Cache invalidation decorator
 * Use with CacheInvalidationService to invalidate cache when method is called
 *
 * Note: This decorator requires the controller to inject CacheInvalidationService
 * For automatic cache invalidation, use the RedisCacheInterceptor with tags
 */

/**
 * Cache key generator utilities
 */
export class CacheKeyGenerator {
  /**
   * Generate key for user-scoped data
   */
  static userScoped(userId: string, ...parts: string[]): string {
    return `user:${userId}:${parts.join(':')}`;
  }

  /**
   * Generate key for brand-scoped data
   */
  static brandScoped(brandId: string, ...parts: string[]): string {
    return `brand:${brandId}:${parts.join(':')}`;
  }

  /**
   * Generate key for organization-scoped data
   */
  static organizationScoped(orgId: string, ...parts: string[]): string {
    return `org:${orgId}:${parts.join(':')}`;
  }

  /**
   * Generate key with pagination parameters
   */
  static paginated(
    base: string,
    page: number,
    limit: number,
    filters: Record<string, unknown> = {},
  ): string {
    const filterKey = Object.keys(filters)
      .sort()
      .map((key) => `${key}:${filters[key]}`)
      .join(',');
    return `${base}:page:${page}:limit:${limit}:filters:${filterKey}`;
  }
}
