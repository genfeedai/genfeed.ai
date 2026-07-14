import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';

import { SelfHostedSeedService } from './self-hosted-seed.service';

vi.mock('@genfeedai/config', () => ({
  isSelfHostedDeployment: vi.fn(() => true),
}));

describe('SelfHostedSeedService', () => {
  const organizationId = 'org_default';
  const userId = 'user_owner';
  let prisma: {
    organization: { findFirst: ReturnType<typeof vi.fn> };
    member: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    role: { findMany: ReturnType<typeof vi.fn> };
  };
  let service: SelfHostedSeedService;

  beforeEach(() => {
    prisma = {
      member: {
        create: vi.fn().mockResolvedValue({ id: 'member_owner' }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      organization: {
        findFirst: vi.fn().mockResolvedValue({
          id: organizationId,
          userId,
        }),
      },
      role: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'role_user', key: 'user' },
          { id: 'role_owner', key: 'owner' },
        ]),
      },
    };
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new SelfHostedSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
      {} as ModuleRef,
    );
  });

  it('backfills an active owner member when the default workspace already exists', async () => {
    await service.onApplicationBootstrap();

    expect(prisma.member.create).toHaveBeenCalledWith({
      data: {
        isActive: true,
        organizationId,
        roleId: 'role_owner',
        roleKey: 'owner',
        userId,
      },
    });
  });

  it('does not duplicate an existing default workspace member', async () => {
    prisma.member.findFirst.mockResolvedValue({
      id: 'member_owner',
      isActive: true,
    });

    await service.onApplicationBootstrap();

    expect(prisma.member.create).not.toHaveBeenCalled();
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('reactivates an inactive default workspace member', async () => {
    prisma.member.findFirst.mockResolvedValue({
      id: 'member_owner',
      isActive: false,
    });

    await service.onApplicationBootstrap();

    expect(prisma.member.update).toHaveBeenCalledWith({
      data: { isActive: true },
      where: { id: 'member_owner' },
    });
    expect(prisma.member.create).not.toHaveBeenCalled();
  });
});
