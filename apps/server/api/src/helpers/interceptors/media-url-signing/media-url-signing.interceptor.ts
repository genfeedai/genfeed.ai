import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { ConfigService } from '@libs/config/config.service';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

// Deep enough for JSON:API documents (data → attributes → nested metadata),
// shallow enough that a pathological payload cannot recurse without bound.
const MAX_DEPTH = 24;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Signs every media URL on this deployment's CDN in an outgoing response.
 *
 * This is the response-boundary chokepoint for media access. Signing here —
 * never in services — guarantees a signed, expiring URL can't be read back and
 * persisted by a read-modify-write, and it covers every endpoint that returns
 * media, including ones added later.
 *
 * It must be registered **outside** the Redis cache interceptor: the cache
 * then stores unsigned payloads and every response, cache hits included,
 * carries a fresh signature instead of one that may expire before the cache
 * entry does.
 *
 * A no-op when the deployment has no signing key pair (self-hosted, local).
 */
@Injectable()
export class MediaUrlSigningInterceptor implements NestInterceptor {
  constructor(
    private readonly configService: ConfigService,
    private readonly mediaUrlService: MediaUrlService,
  ) {}

  intercept(
    _executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (!this.configService.isCdnSigningEnabled) {
      return next.handle();
    }

    const cdnPrefix = `${this.configService.cdnUrl}/`;
    return next
      .handle()
      .pipe(map((body: unknown) => this.signValue(body, cdnPrefix, 0)));
  }

  /**
   * Returns a copy of `value` with CDN URLs signed. Never mutates the input:
   * the body may be the object a cache layer is holding.
   */
  private signValue(value: unknown, cdnPrefix: string, depth: number): unknown {
    if (typeof value === 'string') {
      return value.startsWith(cdnPrefix)
        ? this.mediaUrlService.buildUrlFromAbsolute(value)
        : value;
    }

    if (depth >= MAX_DEPTH) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.signValue(item, cdnPrefix, depth + 1));
    }

    if (isPlainObject(value)) {
      const signed: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        signed[key] = this.signValue(entry, cdnPrefix, depth + 1);
      }
      return signed;
    }

    // Buffers, streams, dates and class instances pass through untouched.
    return value;
  }
}
