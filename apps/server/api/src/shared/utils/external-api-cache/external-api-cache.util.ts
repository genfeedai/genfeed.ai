import crypto from 'node:crypto';
import { CacheService } from '@api/services/cache/services/cache.service';
import type {
  CacheDecoratorTarget,
  CachedMethodArgs,
} from '@libs/interfaces/cache.interface';
import { LoggerService } from '@libs/logger/logger.service';

export interface ExternalApiCacheConfig {
  serviceName: string;
  ttl?: number;
  cacheErrors?: boolean;
  keyPrefix?: string;
}

type CacheDecoratorInstance = {
  cacheService?: CacheService;
  logger?: LoggerService;
};

export class ExternalApiCacheUtil {
  private static readonly DEFAULT_TTL = 3600; // 1 hour
  private static readonly ERROR_TTL = 60; // 1 minute for errors

  /**
   * Wrapper for external API calls with automatic caching
   */
  static async withCache<T>(
    cacheService: CacheService | undefined,
    logger: LoggerService | undefined,
    config: ExternalApiCacheConfig,
    cacheKey: string,
    apiCall: () => Promise<T>,
  ): Promise<T> {
    if (!cacheService) {
      return apiCall();
    }

    const fullKey = ExternalApiCacheUtil.buildCacheKey(
      config.keyPrefix || config.serviceName,
      cacheKey,
    );

    try {
      const cached = await cacheService.get<T>(fullKey);
      if (cached !== null) {
        logger?.debug(`External API cache hit`, {
          key: fullKey,
          service: config.serviceName,
        });
        return cached;
      }
    } catch (error: unknown) {
      logger?.warn(`Cache retrieval failed`, {
        error,
        key: fullKey,
        service: config.serviceName,
      });
    }

    try {
      const result = await apiCall();

      await cacheService.set(fullKey, result, {
        tags: [`external-api`, config.serviceName],
        ttl: config.ttl || ExternalApiCacheUtil.DEFAULT_TTL,
      });

      logger?.debug(`External API result cached`, {
        key: fullKey,
        service: config.serviceName,
        ttl: config.ttl || ExternalApiCacheUtil.DEFAULT_TTL,
      });

      return result;
    } catch (error: unknown) {
      if (config.cacheErrors) {
        await cacheService.set(
          fullKey,
          { cached: true, error: (error as Error)?.message },
          { ttl: ExternalApiCacheUtil.ERROR_TTL },
        );
      }
      throw error;
    }
  }

  /**
   * Generate cache key from request parameters
   */
  static generateCacheKey(params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          if (params[key] !== undefined && params[key] !== null) {
            acc[key] = params[key];
          }
          return acc;
        },
        {} as Record<string, unknown>,
      );

    return crypto
      .createHash('md5')
      .update(JSON.stringify(sortedParams))
      .digest('hex');
  }

  /**
   * Build full cache key with prefix
   */
  static buildCacheKey(prefix: string, key: string): string {
    return `${prefix}:${key}`;
  }

  /**
   * Invalidate all cache entries for a service
   */
  static async invalidateServiceCache(
    cacheService: CacheService,
    serviceName: string,
  ): Promise<void> {
    await cacheService.invalidateByTags([serviceName]);
  }

  /**
   * Create a cached version of an API method
   */
  static createCachedMethod<T extends (...args: unknown[]) => Promise<unknown>>(
    originalMethod: T,
    cacheService: CacheService | undefined,
    logger: LoggerService | undefined,
    config: ExternalApiCacheConfig,
  ): T {
    return ((...args: unknown[]) => {
      const cacheKey = ExternalApiCacheUtil.generateCacheKey({ args });

      return ExternalApiCacheUtil.withCache(
        cacheService,
        logger,
        config,
        cacheKey,
        () => originalMethod(...args),
      );
    }) as T;
  }
}

/**
 * Decorator for caching external API calls
 */
export function ExternalApiCache(config: ExternalApiCacheConfig) {
  return (
    target: CacheDecoratorTarget,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: unknown, ...args: CachedMethodArgs) {
      // Access services from the class instance
      // All services using this decorator must have 'cacheService' and 'logger' properties
      const instance = this as CacheDecoratorInstance;
      const cacheService = instance.cacheService;
      const logger = instance.logger;

      const cacheKey = ExternalApiCacheUtil.generateCacheKey({
        args,
        method: propertyName,
      });

      return ExternalApiCacheUtil.withCache(
        cacheService,
        logger,
        {
          ...config,
          serviceName: `${target.constructor.name}:${propertyName}`,
        },
        cacheKey,
        () => originalMethod.apply(this, args),
      );
    };

    return descriptor;
  };
}
