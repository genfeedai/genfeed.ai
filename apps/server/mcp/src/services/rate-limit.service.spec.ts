import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { ConfigService } from '@mcp/config/config.service';
import {
  applyRateLimitHeaders,
  RateLimitService,
} from '@mcp/services/rate-limit.service';

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    // The service runs the whole window check as one atomic Lua script.
    eval: vi.fn().mockResolvedValue([1, 1, String(Date.now())]),
    ...overrides,
  };
}

function build(client: ReturnType<typeof makeClient> | null) {
  const redis = { getPublisher: vi.fn().mockReturnValue(client) };
  const config = {
    get: vi.fn((key: string) =>
      key === 'MCP_RATE_LIMIT_PER_MINUTE'
        ? 3
        : key === 'MCP_RATE_LIMIT_WINDOW_MS'
          ? 60_000
          : undefined,
    ),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new RateLimitService(
    redis as unknown as RedisService,
    config as unknown as ConfigService,
    logger as unknown as LoggerService,
  );
  return { client, logger, service };
}

describe('RateLimitService.keyFor', () => {
  it('hashes the bearer token (raw token never becomes the key)', () => {
    const { service } = build(makeClient());
    const key = service.keyFor('super-secret-token', '1.2.3.4');
    expect(key).toMatch(/^mcp:ratelimit:tok:[a-f0-9]{64}$/);
    expect(key).not.toContain('super-secret-token');
  });

  it('falls back to IP when there is no token', () => {
    const { service } = build(makeClient());
    expect(service.keyFor(null, '1.2.3.4')).toBe('mcp:ratelimit:ip:1.2.3.4');
    expect(service.keyFor(null, undefined)).toBe('mcp:ratelimit:ip:unknown');
  });
});

describe('RateLimitService.consume', () => {
  it('allows a request under the limit (atomic script reports new count)', async () => {
    // Script returns [allowed, newCount, refScore]; newCount = 2 of a 3 limit.
    const client = makeClient({
      eval: vi.fn().mockResolvedValue([1, 2, String(Date.now())]),
    });
    const { service } = build(client);

    const result = await service.consume('k');

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(1); // limit 3 - new count 2
    expect(client.eval).toHaveBeenCalledOnce();
  });

  it('blocks when at the limit and surfaces a retry hint', async () => {
    const now = Date.now();
    const client = makeClient({
      eval: vi.fn().mockResolvedValue([0, 3, String(now - 5_000)]),
    });
    const { service } = build(client);

    const result = await service.consume('k');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('fails open when Redis is unavailable', async () => {
    const { logger, service } = build(null);
    const result = await service.consume('k');
    expect(result.allowed).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('fails open when the Lua script throws', async () => {
    const client = makeClient({
      eval: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { logger, service } = build(client);
    const result = await service.consume('k');
    expect(result.allowed).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('applyRateLimitHeaders', () => {
  it('sets the standard headers and Retry-After only when blocked', () => {
    const setHeader = vi.fn();
    applyRateLimitHeaders(
      { setHeader },
      {
        allowed: true,
        limit: 60,
        remaining: 42,
        resetAt: 99,
        retryAfterSeconds: 0,
      },
    );
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '42');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', '99');
    expect(setHeader).not.toHaveBeenCalledWith(
      'Retry-After',
      expect.anything(),
    );

    const blockedSetHeader = vi.fn();
    applyRateLimitHeaders(
      { setHeader: blockedSetHeader },
      {
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAt: 99,
        retryAfterSeconds: 30,
      },
    );
    expect(blockedSetHeader).toHaveBeenCalledWith('Retry-After', '30');
  });
});
