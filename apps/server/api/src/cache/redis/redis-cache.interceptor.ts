import { CacheService } from '@api/services/cache/services/cache.service';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import type { RequestWithBody } from '@libs/interfaces/http.interface';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Redis-based caching interceptor that works with the @Cache decorator
 *
 * Features:
 * - Configurable TTL per endpoint
 * - Cache tags for selective invalidation
 * - Custom key generation
 * - Conditional caching
 * - Support for user-scoped caching
 *
 * Usage:
 * @Get()
 * @Cache({
 *   ttl: 300, // 5 minutes
 *   tags: ['users', 'profiles'],
 *   keyGenerator: (req) =>
 *     `user:${req.user?.id ?? 'anonymous'}:profile:${JSON.stringify(req.query)}`,
 * })
 * async getUserProfile(@CurrentUser() user: User, @Query() query: BaseQueryDto) {
 *   // This will be cached automatically
 *   return this.userService.getProfile(user.id, query);
 * }
 */
@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly logger = new Logger(RedisCacheInterceptor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const cacheOptions = this.reflector.get<CacheOptions>(
      'cache',
      context.getHandler(),
    );

    if (!cacheOptions) {
      // No caching configured, proceed normally
      return next.handle();
    }

    // Disable cache if TTL is 0 or negative
    if (cacheOptions.ttl !== undefined && cacheOptions.ttl <= 0) {
      this.logger.debug('Cache disabled: TTL is 0 or negative');
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    // Skip caching if isPreview=true in query params (preview mode should not be cached)
    if (request.query?.isPreview === 'true') {
      this.logger.debug('Skipping cache for preview mode request');
      return next.handle();
    }

    const cacheKey = this.generateCacheKey(context, cacheOptions, request);

    try {
      // Try to get from cache first
      const cachedResult = await this.cacheService.get(cacheKey);

      if (cachedResult != null) {
        this.logger.debug(`Cache hit for key: ${cacheKey}`);
        return of(cachedResult);
      }

      this.logger.debug(`Cache miss for key: ${cacheKey}`);

      // Cache miss, execute handler and cache result
      return next.handle().pipe(
        tap((result) => {
          if (this.shouldCacheResult(result, cacheOptions)) {
            this.cacheResult(cacheKey, result, cacheOptions).catch((err) =>
              this.logger.error('Failed to cache result', err),
            );
          }
        }),
      );
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed`, error);
      // On cache error, proceed without caching
      return next.handle();
    }
  }

  /**
   * Generate cache key from context and options
   */
  private generateCacheKey(
    context: ExecutionContext,
    options: CacheOptions,
    request: RequestWithBody,
  ): string {
    if (options.keyGenerator) {
      return options.keyGenerator(request);
    }

    // Default key generation
    const controller = context.getClass().name;
    const method = context.getHandler().name;
    const route = request.route?.path || request.url;
    const user = request.user?.id || 'anonymous';

    // Include query parameters in key for GET requests
    let queryString = '';
    if (request.method === 'GET' && Object.keys(request.query).length > 0) {
      const queryParams = request.query;
      const sortedQuery = Object.keys(queryParams)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = queryParams[key];
          return result;
        }, {});
      queryString = `:query:${JSON.stringify(sortedQuery)}`;
    }

    // Include normalized request body for non-GET requests
    let bodyString = '';
    if (request.method !== 'GET') {
      const serializedBody = this.serializeRequestBody(request.body);
      if (serializedBody) {
        bodyString = `:body:${serializedBody}`;
      }
    }

    return `${controller}:${method}:${route}:user:${user}${queryString}${bodyString}`;
  }

  /**
   * Serialize request bodies into a consistent string for cache keys
   */
  private serializeRequestBody(body: unknown): string | null {
    if (body == null) {
      return null;
    }

    if (typeof body === 'string' || typeof body === 'number') {
      return JSON.stringify(body);
    }

    if (typeof body === 'boolean') {
      return body ? 'true' : 'false';
    }

    if (Array.isArray(body)) {
      if (body.length === 0) {
        return '[]';
      }
      return this.serializeForCache(body);
    }

    if (body instanceof Date) {
      return JSON.stringify(body.toISOString());
    }

    if (typeof body === 'object') {
      const entries = Object.entries(body as Record<string, unknown>).filter(
        ([, value]) => value !== undefined,
      );

      if (entries.length === 0) {
        return null;
      }

      const normalizedBody = Object.fromEntries(entries) as Record<
        string,
        unknown
      >;
      return this.serializeForCache(normalizedBody);
    }

    return JSON.stringify(body);
  }

  private serializeForCache(value: unknown): string {
    if (value == null) {
      return 'null';
    }

    if (Array.isArray(value)) {
      const serializedItems = value.map((item) => this.serializeForCache(item));
      return `[${serializedItems.join(',')}]`;
    }

    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }

    if (typeof value === 'object') {
      const sortedEntries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(
          ([key, entryValue]) =>
            `${JSON.stringify(key)}:${this.serializeForCache(entryValue)}`,
        );
      return `{${sortedEntries.join(',')}}`;
    }

    return JSON.stringify(value);
  }

  /**
   * Check if result should be cached based on options
   */
  private shouldCacheResult(result: unknown, options: CacheOptions): boolean {
    // Don't cache null/undefined unless explicitly allowed
    if (result == null && !options.cacheNullValues) {
      return false;
    }

    // Check custom condition
    if (options.condition && !options.condition(result)) {
      return false;
    }

    return true;
  }

  /**
   * Cache the result with TTL and tags
   */
  private async cacheResult(
    key: string,
    result: unknown,
    options: CacheOptions,
  ): Promise<void> {
    try {
      await this.cacheService.set(key, result, {
        tags: options.tags,
        ttl: options.ttl,
      });

      this.logger.debug(`Cached result for key: ${key}, TTL: ${options.ttl}s`);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed`, error);
    }
  }
}

/**
 * Cache invalidation service
 * Provides methods to invalidate cache by tags or patterns
 */
@Injectable()
export class CacheInvalidationService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Invalidate all cache entries with specific tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const invalidatedCount = await this.cacheService.invalidateByTags(tags);
      this.logger.log(
        `Invalidated ${invalidatedCount} cache entries for tags: ${tags.join(',')}`,
      );
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed`, error);
    }
  }

  /**
   * Invalidate cache entries matching a pattern
   * Note: Redis pattern matching requires a custom implementation
   */
  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      // For now, we'll use a simple approach for common patterns
      // In production, you might want to implement SCAN for large datasets
      if (pattern.includes('*')) {
        this.logger.warn(
          `Pattern matching with wildcards (${pattern}) requires custom implementation. Use invalidateByTags instead.`,
        );
        return;
      }

      // For exact key deletion
      const deleted = await this.cacheService.del(pattern);
      if (deleted) {
        this.logger.log(`Invalidated cache entry: ${pattern}`);
      }
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed`, error);
    }
  }

  /**
   * Invalidate all cache for a specific user
   */
  async invalidateForUser(userId: string): Promise<void> {
    await this.invalidateByTags([`user:${userId}`]);
  }

  /**
   * Invalidate all cache for a specific controller
   */
  async invalidateForController(controllerName: string): Promise<void> {
    await this.invalidateByTags([controllerName.toLowerCase()]);
  }
}
