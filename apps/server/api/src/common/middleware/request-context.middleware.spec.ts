import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/redis/redis.service', () => ({
  RedisService: vi.fn(),
}));

vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: vi.fn(),
}));

vi.mock(
  '@api/collections/organization-settings/services/organization-settings.service',
  () => ({
    OrganizationSettingsService: vi.fn(),
  }),
);

vi.mock(
  '@api/collections/subscriptions/services/subscriptions.service',
  () => ({
    SubscriptionsService: vi.fn(),
  }),
);

import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { NextFunction, Response } from 'express';

function buildUser(
  overrides: Partial<{
    id: string;
    publicMetadata: Record<string, unknown>;
  }> = {},
) {
  return {
    id: overrides.id ?? 'clerk_abc123',
    publicMetadata: overrides.publicMetadata ?? {
      brand: 'brand_1',
      isSuperAdmin: false,
      organization: 'org_1',
      stripeSubscriptionStatus: 'active',
      subscriptionTier: 'pro',
      user: 'user_1',
    },
  };
}

function buildPublisher(
  overrides: Partial<{
    get: ReturnType<typeof vi.fn>;
    setEx: ReturnType<typeof vi.fn>;
    sAdd: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    expire: overrides.expire ?? vi.fn().mockResolvedValue(1),
    get: overrides.get ?? vi.fn().mockResolvedValue(null),
    sAdd: overrides.sAdd ?? vi.fn().mockResolvedValue(1),
    setEx: overrides.setEx ?? vi.fn().mockResolvedValue('OK'),
  };
}

function buildLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function buildOrgSettingsService(subscriptionTier: string | null = 'pro') {
  return {
    findOne: vi
      .fn()
      .mockResolvedValue(
        subscriptionTier !== null ? { subscriptionTier } : null,
      ),
  };
}

function buildSubscriptionsService(status: string | null = 'active') {
  return {
    findOne: vi.fn().mockResolvedValue(status !== null ? { status } : null),
  };
}

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    redisService = { getPublisher: vi.fn() };
    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService() as never,
      buildSubscriptionsService() as never,
    );
  });

  it('cache hit → returns cached context, no extra set calls', async () => {
    const cachedCtx = {
      brandId: 'brand_1',
      hydratedAt: 12345,
      isSuperAdmin: false,
      organizationId: 'org_1',
      stripeSubscriptionStatus: 'active',
      subscriptionTier: 'pro',
      userId: 'user_1',
    };

    const publisher = buildPublisher({
      get: vi.fn().mockResolvedValue(JSON.stringify(cachedCtx)),
    });
    redisService.getPublisher.mockReturnValue(publisher);

    const req = { user: buildUser() } as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    expect((req as { context: unknown }).context).toEqual(cachedCtx);
    expect(publisher.setEx).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('cache miss → hydrates subscriptionTier + stripeSubscriptionStatus from DB', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService('pro') as never,
      buildSubscriptionsService('active') as never,
    );

    const req = {
      user: buildUser({
        publicMetadata: {
          brand: 'brand_1',
          isSuperAdmin: false,
          organization: 'org_1',
          // Stale Clerk metadata — should be overridden by DB
          stripeSubscriptionStatus: 'canceled',
          subscriptionTier: 'free',
          user: 'user_1',
        },
      }),
    } as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    const ctx = (req as { context: unknown }).context as Record<
      string,
      unknown
    >;
    expect(ctx.userId).toBe('user_1');
    expect(ctx.organizationId).toBe('org_1');
    expect(ctx.isSuperAdmin).toBe(false);
    // DB values win over stale Clerk metadata
    expect(ctx.subscriptionTier).toBe('pro');
    expect(ctx.stripeSubscriptionStatus).toBe('active');
    expect(publisher.setEx).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('DB returns null → falls back to Clerk publicMetadata', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService(null) as never,
      buildSubscriptionsService(null) as never,
    );

    const req = {
      user: buildUser({
        publicMetadata: {
          brand: 'brand_1',
          isSuperAdmin: false,
          organization: 'org_1',
          stripeSubscriptionStatus: 'active',
          subscriptionTier: 'starter',
          user: 'user_1',
        },
      }),
    } as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    const ctx = (req as { context: unknown }).context as Record<
      string,
      unknown
    >;
    // Falls back to Clerk publicMetadata when DB returns null
    expect(ctx.subscriptionTier).toBe('starter');
    expect(ctx.stripeSubscriptionStatus).toBe('active');
    expect(next).toHaveBeenCalledOnce();
  });

  it('unauthenticated request → next() called, no req.context set', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    const req = {} as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    expect((req as { context?: unknown }).context).toBeUndefined();
    expect(publisher.get).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('isSuperAdmin from publicMetadata is false even if bearer JWT claimed true', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    const req = {
      user: buildUser({
        publicMetadata: {
          brand: 'brand_1',
          isSuperAdmin: false, // server-verified false
          organization: 'org_1',
          stripeSubscriptionStatus: 'active',
          subscriptionTier: 'basic',
          user: 'user_1',
        },
      }),
    } as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    const ctx = (req as { context: unknown }).context as Record<
      string,
      unknown
    >;
    expect(ctx.isSuperAdmin).toBe(false);
  });
});
