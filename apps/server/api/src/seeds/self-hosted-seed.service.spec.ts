import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
} from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

import { SelfHostedSeedService } from './self-hosted-seed.service';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: vi.fn(() => true),
  };
});

describe('SelfHostedSeedService', () => {
  const organizationId = 'org_default';
  const userId = 'user_owner';
  let prisma: {
    brand: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    organization: { findFirst: ReturnType<typeof vi.fn> };
    organizationSetting: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    member: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    role: { upsert: ReturnType<typeof vi.fn> };
  };
  let service: SelfHostedSeedService;

  beforeEach(() => {
    prisma = {
      brand: {
        findMany: vi.fn().mockResolvedValue([
          {
            defaultImageModel: null,
            defaultVideoModel: null,
            id: 'brand_default',
          },
        ]),
        update: vi.fn(),
      },
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
      organizationSetting: {
        findFirst: vi.fn().mockResolvedValue({
          defaultImageModel: null,
          defaultModel: null,
          defaultVideoModel: null,
          id: 'setting_default',
        }),
        update: vi.fn(),
      },
      role: {
        upsert: vi.fn().mockResolvedValue({
          id: 'role_owner',
          key: 'owner',
        }),
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
    );
  });

  it('does not clone system workflows on self-host bootstrap', () => {
    const source = readFileSync(
      resolve(__dirname, 'self-hosted-seed.service.ts'),
      'utf8',
    );

    expect(source).not.toContain('provisionDefaultWorkflows');
    expect(source).not.toContain('WorkflowTemplateSeederService');
    expect(source).not.toContain('ensureDailyTrendsDigestWorkflow');
    expect(source).not.toContain('ensureTrendNotificationWorkflows');
  });

  it('backfills an active owner member when the default workspace already exists', async () => {
    await service.onApplicationBootstrap();

    expect(prisma.role.upsert).toHaveBeenCalledWith({
      create: {
        key: 'owner',
        label: 'Owner',
      },
      update: {
        isDeleted: false,
      },
      where: { key: 'owner' },
    });
    expect(prisma.role.upsert).toHaveBeenCalledWith({
      create: {
        key: 'admin',
        label: 'Admin',
      },
      update: {
        isDeleted: false,
      },
      where: { key: 'admin' },
    });
    expect(prisma.role.upsert).toHaveBeenCalledWith({
      create: {
        key: 'user',
        label: 'User',
      },
      update: {
        isDeleted: false,
      },
      where: { key: 'user' },
    });
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
    expect(prisma.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'admin' },
      }),
    );
    expect(prisma.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'user' },
      }),
    );
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

  it('fills empty org and brand model defaults with the lowest-cost keys', async () => {
    prisma.member.findFirst.mockResolvedValue({
      id: 'member_owner',
      isActive: true,
    });

    await service.onApplicationBootstrap();

    expect(prisma.organizationSetting.update).toHaveBeenCalledWith({
      data: {
        defaultImageModel: LOWEST_COST_IMAGE_MODEL_KEY,
        defaultModel: LOWEST_COST_AGENT_CHAT_MODEL_KEY,
        defaultVideoModel: LOWEST_COST_VIDEO_MODEL_KEY,
      },
      where: { id: 'setting_default' },
    });
    expect(prisma.brand.update).toHaveBeenCalledWith({
      data: {
        defaultImageModel: LOWEST_COST_IMAGE_MODEL_KEY,
        defaultVideoModel: LOWEST_COST_VIDEO_MODEL_KEY,
      },
      where: {
        id: 'brand_default',
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('does not overwrite operator-chosen org or brand models', async () => {
    prisma.member.findFirst.mockResolvedValue({
      id: 'member_owner',
      isActive: true,
    });
    prisma.organizationSetting.findFirst.mockResolvedValue({
      defaultImageModel: 'google/nano-banana',
      defaultModel: 'google/gemini-2.5-flash-lite',
      defaultVideoModel: 'bytedance/seedance-2.5',
      id: 'setting_default',
    });
    prisma.brand.findMany.mockResolvedValue([
      {
        defaultImageModel: 'google/nano-banana',
        defaultVideoModel: 'bytedance/seedance-2.5',
        id: 'brand_default',
      },
    ]);

    await service.onApplicationBootstrap();

    expect(prisma.organizationSetting.update).not.toHaveBeenCalled();
    expect(prisma.brand.update).not.toHaveBeenCalled();
  });
});
