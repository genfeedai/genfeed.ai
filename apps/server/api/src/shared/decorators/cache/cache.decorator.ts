import { CacheService } from '@api/services/cache/services/cache.service';
import {
  CacheDecoratorTarget,
  CachedMethodArgs,
} from '@libs/interfaces/cache.interface';
import { Inject } from '@nestjs/common';

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  keyPrefix?: string;
}

type CacheableContext = {
  cacheService?: CacheService;
};

/**
 * Decorator for caching method results
 * @param options Cache configuration options
 */
export function Cacheable(options: CacheOptions = {}) {
  const injectCacheService = Inject(CacheService);

  return (
    target: CacheDecoratorTarget,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    injectCacheService(target, 'cacheService');

    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: unknown,
      ...args: CachedMethodArgs
    ) {
      const { cacheService } = this as CacheableContext;

      if (!cacheService) {
        // Fallback to original method if cache service is not available
        return originalMethod.apply(this, args);
      }

      // Generate cache key based on method name and arguments
      const keyPrefix =
        options.keyPrefix || `${target.constructor.name}:${propertyKey}`;
      const cacheKey = cacheService.generateKey(
        keyPrefix,
        ...args.map((arg) => JSON.stringify(arg)),
      );

      try {
        // Try to get from cache
        const cached = await cacheService.get(cacheKey);
        if (cached !== null) {
          return cached;
        }

        // Execute original method
        const result = await originalMethod.apply(this, args);

        // Cache the result
        await cacheService.set(cacheKey, result, {
          tags: options.tags,
          ttl: options.ttl,
        });

        return result;
      } catch {
        // If caching fails, still return the result
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * Decorator for invalidating cache
 * @param tags Cache tags to invalidate
 */
export function CacheInvalidate(tags: string[]) {
  const injectCacheService = Inject(CacheService);

  return (
    target: CacheDecoratorTarget,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    injectCacheService(target, 'cacheService');

    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: unknown,
      ...args: CachedMethodArgs
    ) {
      const { cacheService } = this as CacheableContext;

      // Execute original method first
      const result = await originalMethod.apply(this, args);

      // Invalidate cache by tags
      if (cacheService && tags.length > 0) {
        await cacheService.invalidateByTags(tags);
      }

      return result;
    };

    return descriptor;
  };
}
