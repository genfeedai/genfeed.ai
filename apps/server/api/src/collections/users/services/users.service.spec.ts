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

import { UsersService } from '@api/collections/users/services/users.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('UsersService', () => {
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
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

    service = new UsersService(
      { user: delegate } as unknown as PrismaService,
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
});
