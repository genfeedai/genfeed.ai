import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

/**
 * A public read is the same bytes for every reader, so a cache in front of the
 * API may hold it for as long as the API's own cache does, up to this ceiling.
 * It stays short because an operator unpublishing a profile clears the API's
 * cache and the change must not outlive a minute anywhere else.
 */
const PUBLIC_CACHE_CONTROL_MAX_SECONDS = 60;

const PUBLIC_CONTROLLER_PREFIX = 'public';

function isPublicController(controller: unknown): boolean {
  const path: unknown = Reflect.getMetadata(
    PATH_METADATA,
    controller as object,
  );
  const segments = Array.isArray(path) ? path : [path];
  return segments.some(
    (segment) =>
      typeof segment === 'string' &&
      (segment === PUBLIC_CONTROLLER_PREFIX ||
        segment.startsWith(`${PUBLIC_CONTROLLER_PREFIX}/`)),
  );
}

/**
 * Sends `Cache-Control` on the anonymous GET reads of the public API that the
 * API itself caches (`@Cache`), so any cache in front can hold them too. It
 * never touches a request that carries credentials (the media projection can
 * differ for a signed-in reader) or a preview token (unpublished content), and
 * an error response gets no header.
 */
@Injectable()
export class PublicCacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    if (request.method !== 'GET' || !isPublicController(context.getClass())) {
      return next.handle();
    }

    const ttl = this.reflector.get<CacheOptions | undefined>(
      'cache',
      context.getHandler(),
    )?.ttl;
    if (!ttl || ttl <= 0) return next.handle();

    if (
      request.headers.authorization ||
      request.headers.cookie ||
      request.query?.previewToken
    ) {
      return next.handle();
    }

    const seconds = Math.min(Math.floor(ttl), PUBLIC_CACHE_CONTROL_MAX_SECONDS);
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (!response.headersSent) {
          response.setHeader(
            'Cache-Control',
            `public, max-age=${seconds}, s-maxage=${seconds}`,
          );
        }
        return body;
      }),
    );
  }
}
