import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { GlobalCaches } from '@api/helpers/utils/cache/cache.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';

/**
 * Memoization utilities for expensive operations
 */
export class MemoizationUtil {
  /**
   * Memoized ObjectId validation
   */
  static validateObjectId = GlobalCaches.getObjectIdCache().memoize(
    (id: string, fieldName: string = 'id') => {
      return ObjectIdUtil.validate(id, fieldName);
    },
    (id: string, fieldName: string = 'id') => `validate:${fieldName}:${id}`,
  );

  /**
   * Memoized ObjectId array validation
   */
  static validateObjectIdArray = GlobalCaches.getObjectIdCache().memoize(
    (ids: string[], fieldName: string = 'ids') => {
      return ObjectIdUtil.validateMany(ids, fieldName);
    },
    (ids: string[], fieldName: string = 'ids') =>
      `validateMany:${fieldName}:${JSON.stringify(ids)}`,
  );

  /**
   * Memoized search parameter processing
   */
  static processSearchParams = GlobalCaches.getObjectIdCache().memoize(
    (params: Record<string, unknown>) => {
      return ObjectIdUtil.processSearchParams(
        params as unknown as BaseQueryDto,
      );
    },
    (params: Record<string, unknown>) =>
      `searchParams:${JSON.stringify(params)}`,
  );

  /**
   * Memoized sort handling
   */
  static handleSort = GlobalCaches.getSortCache().memoize(
    (sort: string) => {
      return handleQuerySort(sort);
    },
    (sort: string) => `sort:${sort}`,
  );

  /**
   * Memoized user context enrichment
   */
  static enrichWithUserContext = GlobalCaches.getObjectIdCache().memoize(
    (dto: unknown, publicMetadata: IClerkPublicMetadata) => {
      const dtoRecord =
        typeof dto === 'object' && dto !== null
          ? (dto as Record<string, unknown>)
          : {};
      return ObjectIdUtil.enrichWithUserContext(dtoRecord, publicMetadata);
    },
    (dto: unknown, publicMetadata: IClerkPublicMetadata) =>
      `userContext:${JSON.stringify(publicMetadata)}:${JSON.stringify(dto)}`,
  );

  /**
   * Memoized secure query creation
   */
  static createSecureQuery = GlobalCaches.getObjectIdCache().memoize(
    (
      baseQuery: Record<string, unknown>,
      userContext?: IClerkPublicMetadata,
    ) => {
      return ObjectIdUtil.createSecureQuery(baseQuery, userContext);
    },
    (baseQuery: Record<string, unknown>, userContext?: IClerkPublicMetadata) =>
      `secureQuery:${JSON.stringify(userContext)}:${JSON.stringify(baseQuery)}`,
  );

  /**
   * Generic memoization for any function
   */
  static memoize<Args extends unknown[], Return>(
    fn: (...args: Args) => Return,
    keyGenerator: (...args: Args) => string,
    ttl: number = 300_000, // 5 minutes default
  ): (...args: Args) => Return {
    const cache = new Map<string, { value: Return; timestamp: number }>();

    return (...args: Args): Return => {
      const key = keyGenerator(...args);
      const now = Date.now();
      const cached = cache.get(key);

      if (cached && now - cached.timestamp < ttl) {
        return cached.value;
      }

      const result = fn(...args);
      cache.set(key, { timestamp: now, value: result });

      // Cleanup old entries periodically
      if (cache.size > 1000) {
        const cutoff = now - ttl;
        for (const [k, v] of cache.entries()) {
          if (v.timestamp < cutoff) {
            cache.delete(k);
          }
        }
      }

      return result;
    };
  }

  /**
   * Async memoization for promises
   */
  static memoizeAsync<Args extends unknown[], Return>(
    fn: (...args: Args) => Promise<Return>,
    keyGenerator: (...args: Args) => string,
    ttl: number = 300_000,
  ): (...args: Args) => Promise<Return> {
    const cache = new Map<
      string,
      { promise: Promise<Return>; timestamp: number }
    >();

    return (...args: Args): Promise<Return> => {
      const key = keyGenerator(...args);
      const now = Date.now();
      const cached = cache.get(key);

      if (cached && now - cached.timestamp < ttl) {
        return cached.promise;
      }

      const promise = fn(...args).catch((error) => {
        // Remove failed promises from cache
        cache.delete(key);
        throw error;
      });

      cache.set(key, { promise, timestamp: now });

      // Cleanup old entries
      if (cache.size > 500) {
        const cutoff = now - ttl;
        for (const [k, v] of cache.entries()) {
          if (v.timestamp < cutoff) {
            cache.delete(k);
          }
        }
      }

      return promise;
    };
  }

  /**
   * Debounced memoization - only execute if not called again within delay
   */
  static debounce<Args extends unknown[], Return>(
    fn: (...args: Args) => Return,
    delay: number = 1000,
  ): (...args: Args) => Promise<Return> {
    const timers = new Map<string, NodeJS.Timeout>();

    return (...args: Args): Promise<Return> => {
      const key = JSON.stringify(args);

      return new Promise((resolve, reject) => {
        // Clear existing timer
        const existingTimer = timers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(() => {
          try {
            const result = fn(...args);
            timers.delete(key);
            resolve(result);
          } catch (error: unknown) {
            timers.delete(key);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, delay);

        timers.set(key, timer);
      });
    };
  }

  /**
   * Throttled memoization - limit execution rate
   */
  static throttle<Args extends unknown[], Return>(
    fn: (...args: Args) => Return,
    interval: number = 1000,
  ): (...args: Args) => Return | undefined {
    const lastCalled = new Map<string, number>();

    return (...args: Args): Return | undefined => {
      const key = JSON.stringify(args);
      const now = Date.now();
      const last = lastCalled.get(key) || 0;

      if (now - last >= interval) {
        lastCalled.set(key, now);
        return fn(...args);
      }

      return undefined;
    };
  }

  /**
   * Clear all memoization caches
   */
  static clearAll(): void {
    GlobalCaches.clearAll();
  }

  /**
   * Get cache statistics
   */
  static getStats(): Record<string, unknown> {
    return GlobalCaches.getAllStats();
  }
}
