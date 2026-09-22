// UsersService.findAll's select-projection logic doesn't read getModelMeta's
// field/enum contents for these assertions — only PrismaClient is exercised.
// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.User via the light
// @genfeedai/prisma/testing subpath replaces the placeholder above.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  SIGNUP_ATTRIBUTION_WINDOW_MS,
  UsersService,
} from '@api/collections/users/services/users.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('UsersService', () => {
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let attributionDelegate: { createMany: ReturnType<typeof vi.fn> };
  let service: UsersService;

  beforeEach(() => {
    delegate = {
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: 'user_1' }]),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };

    attributionDelegate = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };

    service = new UsersService(
      {
        user: delegate,
        userSignupAttribution: attributionDelegate,
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('uses an explicit user-list projection with platformRole instead of the removed isSuperAdmin field', async () => {
    await service.findAll({ where: {} }, { page: 1, limit: 20 });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          platformRole: true,
          settings: true,
        }),
      }),
    );
    const [args] = delegate.findMany.mock.calls[0];
    expect(args.select).not.toHaveProperty('isSuperAdmin');
    // Column dropped in migration 20260726213000 / #2110. Re-adding it here
    // resurrects Sentry API-GENFEED-AI-65 on any environment that already ran
    // the drop migration (#2185).
    expect(args.select).not.toHaveProperty('authProviderId');
  });

  it('returns the identity and activity fields required by the admin user list', async () => {
    await service.findAll({ where: {} }, { page: 1, limit: 20 });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          createdAt: true,
          lastActiveAt: true,
          name: true,
        }),
      }),
    );
  });

  it('preserves an explicit caller select', async () => {
    await service.findAll(
      { select: { id: true }, where: {} },
      { page: 1, limit: 20 },
    );

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
      }),
    );
  });

  it('converts caller include options into the safe user-list select', async () => {
    await service.findAll(
      { include: { members: true }, where: {} },
      { page: 1, limit: 20 },
    );

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          members: true,
          platformRole: true,
          settings: true,
        }),
      }),
    );
    const [args] = delegate.findMany.mock.calls[0];
    expect(args).not.toHaveProperty('include');
  });

  describe('recordSignupAttribution', () => {
    it('records the first-touch source once for a new account', async () => {
      delegate.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(
        service.recordSignupAttribution('user_1', {
          landingPath: '/studio',
          referrerDomain: 'chatgpt.com',
        }),
      ).resolves.toBe(true);

      expect(delegate.findFirst).toHaveBeenCalledWith({
        select: { createdAt: true },
        where: { id: 'user_1', isDeleted: false },
      });
      expect(attributionDelegate.createMany).toHaveBeenCalledWith({
        data: [
          {
            landingPath: '/studio',
            referrerDomain: 'chatgpt.com',
            userId: 'user_1',
            utmCampaign: undefined,
            utmContent: undefined,
            utmMedium: undefined,
            utmSource: undefined,
          },
        ],
        skipDuplicates: true,
      });
    });

    it('keeps the existing record when attribution is posted again', async () => {
      delegate.findFirst.mockResolvedValue({ createdAt: new Date() });
      attributionDelegate.createMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordSignupAttribution('user_1', { utmSource: 'google' }),
      ).resolves.toBe(false);
    });

    it('ignores accounts older than the attribution window', async () => {
      delegate.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - SIGNUP_ATTRIBUTION_WINDOW_MS - 1),
      });

      await expect(
        service.recordSignupAttribution('user_1', { utmSource: 'google' }),
      ).resolves.toBe(false);
      expect(attributionDelegate.createMany).not.toHaveBeenCalled();
    });
  });
});
