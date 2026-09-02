vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ReplyBotConfigsService persistence', () => {
  const replyBotConfig = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  let service: ReplyBotConfigsService;

  beforeEach(() => {
    vi.clearAllMocks();
    replyBotConfig.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: new Date(),
        id: 'bot-1',
        isDeleted: false,
        updatedAt: new Date(),
      }),
    );
    replyBotConfig.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: new Date(),
        id: 'bot-1',
        isDeleted: false,
        updatedAt: new Date(),
      }),
    );

    service = new ReplyBotConfigsService(
      { replyBotConfig } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('writes real scalar columns and packs domain settings into config', async () => {
    await service.create(
      {
        actionType: ReplyBotActionType.REPLY_ONLY,
        brandId: 'brand-1',
        credentialId: 'credential-1',
        isActive: true,
        name: 'Replies',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
        type: ReplyBotType.REPLY_GUY,
        userId: 'user-1',
      },
      [],
    );

    expect(replyBotConfig.create).toHaveBeenCalledWith({
      data: {
        actionType: ReplyBotActionType.REPLY_ONLY,
        brandId: 'brand-1',
        config: expect.objectContaining({
          credentialId: 'credential-1',
          name: 'Replies',
          platform: ReplyBotPlatform.TWITTER,
          rateLimits: expect.objectContaining({
            maxRepliesPerDay: 50,
            maxRepliesPerHour: 10,
          }),
        }),
        isActive: true,
        organizationId: 'org-1',
        type: ReplyBotType.REPLY_GUY,
        userId: 'user-1',
      },
    });
  });

  it('creates bots paused by default', async () => {
    await service.create(
      {
        name: 'Draft bot',
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
        type: ReplyBotType.REPLY_GUY,
        userId: 'user-1',
      },
      [],
    );

    expect(replyBotConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isActive: false }),
    });
  });

  it('merges config-backed patches and keeps scalar fields out of JSON', async () => {
    replyBotConfig.findFirst.mockResolvedValue({
      config: { credentialId: 'credential-1', name: 'Old name' },
      id: 'bot-1',
      organizationId: 'org-1',
    });

    await service.patch('bot-1', { isActive: true, name: 'New name' }, []);

    expect(replyBotConfig.update).toHaveBeenCalledWith({
      data: {
        config: { credentialId: 'credential-1', name: 'New name' },
        isActive: true,
      },
      where: { id: 'bot-1' },
    });
  });
});
