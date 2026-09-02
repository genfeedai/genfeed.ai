import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BotsLivestreamService', () => {
  const prisma = {
    bot: { findFirst: vi.fn() },
    livestreamBotSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const deliveryService = { deliverMessage: vi.fn() };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const replicateService = {};
  const runtimeService = {
    buildContextAwareQuestion: vi.fn(),
    getDeliveryEligibility: vi.fn(),
  };

  let service: BotsLivestreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.livestreamBotSession.findMany.mockResolvedValue([]);
    prisma.livestreamBotSession.findFirst.mockResolvedValue(null);
    prisma.livestreamBotSession.create.mockResolvedValue(
      sessionRow('session-new', {
        botId: 'bot-1',
        organizationId: 'org-1',
        status: 'stopped',
      }),
    );
    prisma.bot.findFirst.mockResolvedValue(null);
    runtimeService.getDeliveryEligibility.mockReturnValue({ allowed: false });
    runtimeService.buildContextAwareQuestion.mockReturnValue('Say hello');

    service = new BotsLivestreamService(
      prisma as never,
      deliveryService as never,
      loggerService as never,
      replicateService as never,
      runtimeService as never,
    );
  });

  it('processes only active livestream sessions for the workflow organization', async () => {
    prisma.livestreamBotSession.findMany.mockResolvedValue([
      sessionRow('session-1', {
        botId: 'bot-1',
        organizationId: 'org-1',
        status: 'active',
      }),
      sessionRow('session-2', {
        botId: 'bot-2',
        organizationId: 'org-1',
        status: 'paused',
      }),
    ]);
    prisma.bot.findFirst.mockResolvedValue(botRow('bot-1'));

    const sessions =
      await service.discoverActiveSessionsForOrganization('org-1');
    const session = sessions[0];
    if (!session) throw new Error('Expected an active session');
    const result = await service.loadActiveSessionContext('org-1', session);

    expect(prisma.livestreamBotSession.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, organizationId: 'org-1' },
    });
    expect(prisma.bot.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.bot.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'bot-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(sessions).toHaveLength(1);
    expect(result).toMatchObject({ sessionId: 'session-1', status: 'loaded' });
  });

  it('skips active sessions whose bot is missing or deleted', async () => {
    prisma.livestreamBotSession.findMany.mockResolvedValue([
      sessionRow('session-1', {
        botId: 'missing-bot',
        organizationId: 'org-1',
        status: 'active',
      }),
    ]);
    prisma.bot.findFirst.mockResolvedValue(null);

    const [session] =
      await service.discoverActiveSessionsForOrganization('org-1');
    if (!session) throw new Error('Expected an active session');
    const result = await service.loadActiveSessionContext('org-1', session);

    expect(result).toMatchObject({ sessionId: 'session-1', status: 'skipped' });
  });

  it('discovers only eligible delivery targets for one loaded session', () => {
    runtimeService.getDeliveryEligibility.mockReturnValue({ allowed: true });
    const result = service.discoverActiveSessionTargets({
      bot: botRow('bot-1', {
        targets: [
          {
            channelId: 'channel-1',
            isEnabled: true,
            platform: BotPlatform.TWITCH,
          },
          {
            channelId: 'disabled',
            isEnabled: false,
            platform: BotPlatform.YOUTUBE,
          },
        ],
      }),
      session: sessionRow('session-1', {
        botId: 'bot-1',
        organizationId: 'org-1',
        status: 'active',
      }),
      status: 'loaded',
    });

    expect(result.items).toHaveLength(1);
    expect(result.baseInput).toMatchObject({ sessionId: 'session-1' });
  });

  it('returns no work when the organization has no active sessions', async () => {
    prisma.livestreamBotSession.findMany.mockResolvedValue([
      sessionRow('session-1', {
        botId: 'bot-1',
        organizationId: 'org-1',
        status: 'paused',
      }),
    ]);

    const result = await service.discoverActiveSessionsForOrganization('org-1');

    expect(prisma.bot.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('fails closed when creating a session without organizationId', async () => {
    await expect(
      service.getOrCreateSession(
        botRow('bot-1', { organizationId: undefined }) as never,
      ),
    ).rejects.toThrow(
      "Livestream bot is missing a resolvable 'organization' id",
    );
    expect(prisma.livestreamBotSession.create).not.toHaveBeenCalled();
  });

  it('does not create a session from the Document organization alias', async () => {
    await expect(
      service.getOrCreateSession(
        botRow('bot-1', {
          organization: 'org-1',
          organizationId: undefined,
        }) as never,
      ),
    ).rejects.toThrow(
      "Livestream bot is missing a resolvable 'organization' id",
    );
    expect(prisma.livestreamBotSession.create).not.toHaveBeenCalled();
  });
});

function sessionRow(
  id: string,
  data: {
    botId: string;
    organizationId: string;
    status: string;
  },
): Record<string, unknown> {
  return {
    createdAt: new Date('2026-06-24T09:00:00.000Z'),
    data,
    id,
    isDeleted: false,
    updatedAt: new Date('2026-06-24T09:00:00.000Z'),
  };
}

function botRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    brandId: 'brand-1',
    id,
    isDeleted: false,
    livestreamSettings: {},
    organizationId: 'org-1',
    targets: [],
    userId: 'user-1',
    ...overrides,
  };
}
