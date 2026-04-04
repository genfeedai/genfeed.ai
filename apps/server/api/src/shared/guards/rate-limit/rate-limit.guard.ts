import { CacheService } from '@api/services/cache/services/cache.service';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

type ScopedRequest = Request & {
  auth?: { publicMetadata?: { user?: string } };
  context?: { organizationId?: string; userId?: string };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitOptions = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no rate limit is specified, allow the request
    if (!rateLimitOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const response = context.switchToHttp().getResponse();

    // Generate rate limit key
    const key = this.generateKey(request, rateLimitOptions);

    // Get window configuration
    const windowMs = rateLimitOptions.windowMs || 60000; // Default 1 minute
    const limit = rateLimitOptions.limit || 100; // Default 100 requests

    // Get current count from cache
    const currentCount = await this.cacheService.incr(key, 1);

    // If this is the first request, set expiry
    if (currentCount === 1) {
      await this.cacheService.expire(key, Math.ceil(windowMs / 1000));
    }

    // Set rate limit headers
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, limit - currentCount),
    );
    response.setHeader(
      'X-RateLimit-Reset',
      new Date(Date.now() + windowMs).toISOString(),
    );

    // Check if limit exceeded
    if (currentCount > limit) {
      // Set retry-after header
      response.setHeader('Retry-After', Math.ceil(windowMs / 1000));

      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          detail: `Rate limit exceeded. Please retry after ${Math.ceil(windowMs / 1000)} seconds.`,
          title: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private generateKey(
    request: ScopedRequest,
    rateLimitOptions: RateLimitOptions,
  ): string {
    const parts: string[] = ['rate-limit'];

    // Add endpoint identifier
    parts.push(request.method);
    parts.push(request.route?.path || request.path);

    // Add custom identifier from rate limit options if provided
    if (rateLimitOptions?.user) {
      parts.push('custom', rateLimitOptions.user);
    }

    if (rateLimitOptions.scope === 'organization') {
      const organizationId = request.context?.organizationId;
      if (organizationId) {
        parts.push('org', organizationId);
        return parts.join(':');
      }
    }

    if (rateLimitOptions.scope === 'user') {
      const userId =
        request.context?.userId || request.auth?.publicMetadata?.user;
      if (userId) {
        parts.push('user', userId);
        return parts.join(':');
      }
    }

    // Default/fallback key by IP
    const ip =
      request.ip ||
      request.headers['x-forwarded-for'] ||
      request.connection.remoteAddress ||
      'unknown';
    parts.push('ip', String(ip));

    return parts.join(':');
  }
}
