import { CacheService } from '@api/services/cache/cache.service';
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
import type { Request, Response } from 'express';

type ScopedRequest = Request & {
  auth?: { userId?: string };
  context?: { organizationId?: string; userId?: string };
  user?: { id?: string; userId?: string };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const configured = this.reflector.get<
      RateLimitOptions | RateLimitOptions[] | undefined
    >(RATE_LIMIT_KEY, context.getHandler());

    // If no rate limit is specified, allow the request
    if (!configured) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const response = context.switchToHttp().getResponse();
    for (const options of Array.isArray(configured)
      ? configured
      : [configured]) {
      await this.enforce(request, response, options);
    }
    return true;
  }

  private async enforce(
    request: ScopedRequest,
    response: Response,
    rateLimitOptions: RateLimitOptions,
  ): Promise<void> {
    const key = this.generateKey(request, rateLimitOptions);

    const windowMs = rateLimitOptions.windowMs || 60000; // Default 1 minute
    const limit = rateLimitOptions.limit || 100; // Default 100 requests

    // Get current count from cache
    const currentCount = await this.cacheService.incr(key, 1);

    // If this is the first request, set expiry
    if (currentCount === 1) {
      await this.cacheService.expire(key, Math.ceil(windowMs / 1000));
    }

    // A shared window says nothing about this caller's own allowance.
    if (rateLimitOptions.scope !== 'global') {
      response.setHeader('X-RateLimit-Limit', limit);
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.max(0, limit - currentCount),
      );
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + windowMs).toISOString(),
      );
      response.setHeader('RateLimit-Limit', limit);
      response.setHeader(
        'RateLimit-Remaining',
        Math.max(0, limit - currentCount),
      );
      response.setHeader('RateLimit-Reset', Math.ceil(windowMs / 1000));
    }

    if (currentCount > limit) {
      response.setHeader('Retry-After', Math.ceil(windowMs / 1000));

      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          detail:
            rateLimitOptions.message ??
            `Rate limit exceeded. Please retry after ${Math.ceil(windowMs / 1000)} seconds.`,
          title: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private generateKey(
    request: ScopedRequest,
    rateLimitOptions: RateLimitOptions,
  ): string {
    const parts: string[] = ['rate-limit'];

    // Add endpoint identifier
    parts.push(request.method);
    parts.push(request.route?.path || request.path);

    // `request.route.path` is the route's pattern (e.g. `/:webhookId`), not
    // the resolved value, so every distinct resource behind a route param
    // would otherwise share one bucket. Fold the resolved param into the key
    // whenever a route declares one, so e.g. two workflow webhooks (or two
    // API keys, two organizations, ...) never share a rate-limit counter —
    // see genfeedai/genfeed.ai#5248 (public workflow webhook trigger, keyed
    // on webhookId + IP).
    const routeIdParam = request.params?.webhookId;
    const webhookIdParam = Array.isArray(routeIdParam)
      ? routeIdParam[0]
      : routeIdParam;
    if (webhookIdParam) {
      parts.push('id', webhookIdParam);
    }

    // Add custom identifier from rate limit options if provided
    if (rateLimitOptions?.user) {
      parts.push('custom', rateLimitOptions.user);
    }

    if (rateLimitOptions.scope === 'global') {
      parts.push('global');
      return parts.join(':');
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
        request.context?.userId ||
        request.user?.userId ||
        request.user?.id ||
        request.auth?.userId;
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
