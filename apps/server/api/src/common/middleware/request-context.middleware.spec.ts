import { beforeEach, describe, expect, it, vi } from 'vitest';

const configState = vi.hoisted(() => ({
  isSelfHosted: false,
}));

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => configState.isSelfHosted,
  };
});

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

import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { NextFunction, Response } from 'express';

function buildUser(
  overrides: Partial<{
    brandId: string;
    id: string;
    isSuperAdmin: boolean;
    organizationId: string;
    stripeSubscriptionStatus: string;
    subscriptionTier: string;
    userId: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'authProvider_abc123',
    brandId: overrides.brandId ?? 'brand_1',
    isSuperAdmin: overrides.isSuperAdmin ?? false,
    organizationId: overrides.organizationId ?? 'org_1',
    stripeSubscriptionStatus: overrides.stripeSubscriptionStatus ?? 'active',
    subscriptionTier: overrides.subscriptionTier ?? 'pro',
    userId: overrides.userId ?? 'user_1',
  };
}

function buildPublisher(
  overrides: Partial<{
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    sadd: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    expire: overrides.expire ?? vi.fn().mockResolvedValue(1),
    get: overrides.get ?? vi.fn().mockResolvedValue(null),
    sadd: overrides.sadd ?? vi.fn().mockResolvedValue(1),
    setex: overrides.setex ?? vi.fn().mockResolvedValue('OK'),
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

function buildPrismaService() {
  return {
    brand: {
      findFirst: vi.fn().mockResolvedValue({ id: 'brand_default' }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ id: 'org_default' }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'user_default' }),
    },
  };
}

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;
  let redisService: { getPublisher: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configState.isSelfHosted = false;
    redisService = { getPublisher: vi.fn() };
    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService() as never,
      buildSubscriptionsService() as never,
      {} as never,
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
    expect(publisher.setex).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('hydrate() is callable outside the middleware chain and is idempotent', async () => {
    // CombinedAuthGuard re-runs hydration once request.user is known — the
    // Express middleware itself runs before any Nest guard sets the user.
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService('pro') as never,
      buildSubscriptionsService('active') as never,
      {} as never,
    );

    const req = { user: buildUser() } as never;

    await middleware.hydrate(req);
    const firstContext = (req as { context: unknown }).context;
    expect(firstContext).toMatchObject({
      organizationId: 'org_1',
      subscriptionTier: 'pro',
    });

    await middleware.hydrate(req);
    expect((req as { context: unknown }).context).toBe(firstContext);
    expect(publisher.setex).toHaveBeenCalledOnce();
  });

  it('cache miss → hydrates subscriptionTier + stripeSubscriptionStatus from DB', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService('pro') as never,
      buildSubscriptionsService('active') as never,
      {} as never,
    );

    const req = {
      user: buildUser({
        brandId: 'brand_1',
        isSuperAdmin: false,
        organizationId: 'org_1',
        // Stale legacy auth provider metadata — should be overridden by DB
        stripeSubscriptionStatus: 'canceled',
        subscriptionTier: 'free',
        userId: 'user_1',
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
    // DB values win over stale legacy auth provider metadata
    expect(ctx.subscriptionTier).toBe('pro');
    expect(ctx.stripeSubscriptionStatus).toBe('active');
    expect(publisher.setex).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('DB returns null → falls back to legacy auth provider identity', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService(null) as never,
      buildSubscriptionsService(null) as never,
      {} as never,
    );

    const req = {
      user: buildUser({
        brandId: 'brand_1',
        isSuperAdmin: false,
        organizationId: 'org_1',
        stripeSubscriptionStatus: 'active',
        subscriptionTier: 'starter',
        userId: 'user_1',
      }),
    } as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    const ctx = (req as { context: unknown }).context as Record<
      string,
      unknown
    >;
    // Falls back to legacy auth provider identity when DB returns null
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

  it('isSuperAdmin from identity is false even if bearer JWT claimed true', async () => {
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);

    const req = {
      user: buildUser({
        brandId: 'brand_1',
        isSuperAdmin: false, // server-verified false
        organizationId: 'org_1',
        stripeSubscriptionStatus: 'active',
        subscriptionTier: 'basic',
        userId: 'user_1',
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

  it('hydrates self-hosted context with the default brand', async () => {
    configState.isSelfHosted = true;
    const publisher = buildPublisher();
    redisService.getPublisher.mockReturnValue(publisher);
    const prisma = buildPrismaService();

    middleware = new RequestContextMiddleware(
      redisService as unknown as RedisService,
      buildLogger(),
      buildOrgSettingsService('free') as never,
      buildSubscriptionsService('active') as never,
      prisma as never,
    );

    const req = {} as never;
    const next: NextFunction = vi.fn();

    await middleware.use(req, {} as Response, next);

    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: {
        isDefault: true,
        isDeleted: false,
        organizationId: 'org_default',
      },
    });
    expect((req as { context: unknown }).context).toEqual(
      expect.objectContaining({
        brandId: 'brand_default',
        isSuperAdmin: true,
        organizationId: 'org_default',
        subscriptionTier: 'free',
        userId: 'user_default',
      }),
    );
    expect(publisher.setex).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.stringContaining('"brandId":"brand_default"'),
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
