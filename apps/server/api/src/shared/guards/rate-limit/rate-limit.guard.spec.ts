import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

// Mock the guard dependencies
vi.mock('@nestjs/core', () => ({
  Reflector: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
  })),
}));

vi.mock('@api/services/cache/services/cache.service', () => ({
  CacheService: vi.fn().mockImplementation(() => ({
    expire: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
  })),
}));

import type { RateLimitOptions } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
// Import after mocks
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';

function createMockContext(overrides: {
  rateLimitOptions?: RateLimitOptions | null;
  ip?: string;
  userId?: string;
  organizationId?: string;
  method?: string;
  path?: string;
  currentCount?: number;
}) {
  const {
    rateLimitOptions,
    ip = '127.0.0.1',
    userId,
    organizationId,
    method = 'GET',
    path = '/test',
    currentCount = 1,
  } = overrides;

  const mockIncr = vi.fn().mockResolvedValue(currentCount);
  const mockExpire = vi.fn().mockResolvedValue(undefined);
  const mockSetHeader = vi.fn();

  const mockRequest = {
    auth: userId ? { publicMetadata: { user: userId } } : undefined,
    connection: { remoteAddress: ip },
    context: {
      ...(organizationId ? { organizationId } : {}),
      ...(userId ? { userId } : {}),
    },
    headers: {},
    ip,
    method,
    path,
    route: { path },
  };

  const mockResponse = { setHeader: mockSetHeader };

  const cacheService = {
    expire: mockExpire,
    incr: mockIncr,
  };

  const reflector = {
    get: vi.fn().mockReturnValue(rateLimitOptions ?? undefined),
  };

  const context = {
    getHandler: vi.fn().mockReturnValue(() => {}),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
  };

  const guard = new RateLimitGuard(reflector as never, cacheService as never);

  return {
    cacheService,
    context,
    guard,
    mockExpire,
    mockIncr,
    mockSetHeader,
  };
}

describe('RateLimitGuard', () => {
  it('should be defined', () => {
    const { guard } = createMockContext({ rateLimitOptions: null });
    expect(guard).toBeDefined();
  });

  it('allows request when no rate limit options are set', async () => {
    const { guard, context } = createMockContext({ rateLimitOptions: null });
    const result = await guard.canActivate(context as never);
    expect(result).toBe(true);
  });

  it('increments the cache counter for rate-limited endpoints', async () => {
    const { guard, context, mockIncr } = createMockContext({
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    await guard.canActivate(context as never);
    expect(mockIncr).toHaveBeenCalled();
  });

  it('sets X-RateLimit-Limit header', async () => {
    const limit = 50;
    const { guard, context, mockSetHeader } = createMockContext({
      rateLimitOptions: { limit, windowMs: 60000 },
    });
    await guard.canActivate(context as never);
    expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', limit);
  });

  it('sets X-RateLimit-Remaining header', async () => {
    const { guard, context, mockSetHeader } = createMockContext({
      currentCount: 5,
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    await guard.canActivate(context as never);
    expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 95);
  });

  it('sets expiry on first request (count=1)', async () => {
    const { guard, context, mockExpire } = createMockContext({
      currentCount: 1,
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    await guard.canActivate(context as never);
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  it('does not set expiry on subsequent requests', async () => {
    const { guard, context, mockExpire } = createMockContext({
      currentCount: 5,
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    await guard.canActivate(context as never);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it('throws 429 when limit is exceeded', async () => {
    const { guard, context } = createMockContext({
      currentCount: 101,
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    await expect(guard.canActivate(context as never)).rejects.toThrow(
      HttpException,
    );
  });

  it('thrown exception has TOO_MANY_REQUESTS status', async () => {
    const { guard, context } = createMockContext({
      currentCount: 101,
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    try {
      await guard.canActivate(context as never);
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('uses user ID in rate limit key when scope is user', async () => {
    const { guard, context, mockIncr } = createMockContext({
      rateLimitOptions: { limit: 100, scope: 'user' },
      userId: 'user-123',
    });
    await guard.canActivate(context as never);
    const key = mockIncr.mock.calls[0][0] as string;
    expect(key).toContain('user-123');
  });

  it('uses organization ID in key when scope is organization', async () => {
    const { guard, context, mockIncr } = createMockContext({
      organizationId: 'org-123',
      rateLimitOptions: { limit: 100, scope: 'organization' },
    });
    await guard.canActivate(context as never);
    const key = mockIncr.mock.calls[0][0] as string;
    expect(key).toContain('org-123');
  });

  it('falls back to IP address when unauthenticated or scope missing', async () => {
    const { guard, context, mockIncr } = createMockContext({
      ip: '10.0.0.1',
      rateLimitOptions: { limit: 100 },
    });
    await guard.canActivate(context as never);
    const key = mockIncr.mock.calls[0][0] as string;
    expect(key).toContain('10.0.0.1');
  });

  it('sets Retry-After header when limit exceeded', async () => {
    const { guard, context, mockSetHeader } = createMockContext({
      currentCount: 101,
      rateLimitOptions: { limit: 100, windowMs: 60000 },
    });
    try {
      await guard.canActivate(context as never);
    } catch {
      // expected
    }
    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', 60);
  });
});
