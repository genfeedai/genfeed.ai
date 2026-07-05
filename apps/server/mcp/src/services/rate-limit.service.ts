import { createHash, randomBytes } from 'node:crypto';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { ConfigService } from '@mcp/config/config.service';
import { Injectable } from '@nestjs/common';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix epoch seconds when the current window frees up a slot. */
  resetAt: number;
  /** Seconds until the caller may retry; only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

/** Minimal response surface both the Express middleware and Nest guard share. */
interface RateLimitHeaderSink {
  setHeader(name: string, value: string): void;
}

/**
 * Apply standard rate-limit headers to a response. `Retry-After` is only set
 * when the request was blocked. Header shape mirrors the API's `RateLimitGuard`.
 */
export function applyRateLimitHeaders(
  res: RateLimitHeaderSink,
  result: RateLimitResult,
): void {
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetAt));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
  }
}

/**
 * Per-caller sliding-window rate limiter for the MCP transport, backed by a
 * Redis sorted set (ports the proven `ApiKeysService.checkRateLimit` pattern).
 * Fails OPEN: if Redis is unavailable or errors, requests are allowed rather
 * than hard-blocking the whole transport — consistent with the rest of the
 * codebase's Redis usage.
 */
@Injectable()
export class RateLimitService {
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.limit = Number(
      this.configService.get('MCP_RATE_LIMIT_PER_MINUTE') ?? 60,
    );
    this.windowMs = Number(
      this.configService.get('MCP_RATE_LIMIT_WINDOW_MS') ?? 60_000,
    );
  }

  /**
   * Build the sliding-window key for a request. Callers presenting a bearer
   * token are keyed by a hash of it (never the raw token — it would otherwise
   * sit in Redis as a map/key value); tokenless callers fall back to their IP.
   *
   * This caps the per-caller request rate (the product requirement, matching
   * vitae's transport). It does NOT by itself defeat an attacker rotating many
   * distinct bogus tokens to force `/auth/whoami` — that abuse is bounded by the
   * `< 32` char fast-reject and the whoami cache in `AuthService`, plus the ALB
   * in front of the service; a dedicated per-IP auth-attempt cap is possible
   * future hardening.
   */
  keyFor(bearerToken: string | null, ip: string | undefined): string {
    if (bearerToken) {
      const hash = createHash('sha256').update(bearerToken).digest('hex');
      return `mcp:ratelimit:tok:${hash}`;
    }
    return `mcp:ratelimit:ip:${ip ?? 'unknown'}`;
  }

  private allowResult(count: number): RateLimitResult {
    const resetAt = Math.floor((Date.now() + this.windowMs) / 1000);
    return {
      allowed: true,
      limit: this.limit,
      remaining: Math.max(0, this.limit - count),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Record a request against `key` and report whether it is within the window
   * limit. The whole check (prune → count → conditional add → refresh TTL) runs
   * as ONE atomic Redis Lua script, so concurrent requests for the same key
   * (the MCP server is stateless/multi-instance) can never all observe the same
   * under-limit count and burst over the limit, and a blocked or allowed key is
   * never left without a TTL. On any Redis problem the request is allowed
   * (fail-open) rather than hard-blocking the transport.
   *
   * Returns `[allowed(1|0), count, referenceScoreMs]` where `referenceScoreMs`
   * is the current time (allowed) or the oldest in-window entry (blocked).
   */
  private static readonly CONSUME_LUA = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
    local count = redis.call('ZCARD', KEYS[1])
    if count >= tonumber(ARGV[3]) then
      local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
      local ref = oldest[2] or ARGV[1]
      return {0, count, ref}
    end
    redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
    return {1, count + 1, ARGV[1]}
  `;

  async consume(key: string): Promise<RateLimitResult> {
    const client = this.redisService.getPublisher();
    if (!client) {
      this.logger.warn(
        'Redis unavailable for MCP rate limiting, allowing request',
      );
      return this.allowResult(0);
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;
    const ttlSeconds = Math.ceil(this.windowMs / 1000) + 10;
    const member = `${now}:${randomBytes(4).toString('hex')}`;

    try {
      const raw = (await client.eval(
        RateLimitService.CONSUME_LUA,
        1,
        key,
        String(now),
        String(windowStart),
        String(this.limit),
        member,
        String(ttlSeconds),
      )) as [number, number, string];

      const [allowedFlag, count, referenceScore] = raw;

      if (allowedFlag === 1) {
        return this.allowResult(count);
      }

      // Blocked: the oldest in-window entry determines when a slot frees up.
      const oldestScore = Number(referenceScore) || now;
      const resetAt = Math.floor((oldestScore + this.windowMs) / 1000);
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, resetAt - Math.floor(now / 1000)),
      };
    } catch (error: unknown) {
      this.logger.error('MCP rate limit check failed, allowing request', {
        error: (error as Error)?.message,
      });
      return this.allowResult(0);
    }
  }
}
