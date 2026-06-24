import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BotsLivestreamService', () => {
  const prisma = {
    bot: { findFirst: vi.fn() },
    livestreamBotSession: {
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
    getDeliveryEligibility: vi.fn(),
  };

  let service: BotsLivestreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.livestreamBotSession.findMany.mockResolvedValue([]);
    prisma.bot.findFirst.mockResolvedValue(null);
    runtimeService.getDeliveryEligibility.mockReturnValue({ allowed: false });

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
      sessionRow('session-3', {
        botId: 'bot-3',
        organizationId: 'org-2',
        status: 'active',
      }),
    ]);
    prisma.bot.findFirst.mockResolvedValue(botRow('bot-1'));

    const result = await service.processActiveSessionsForOrganization('org-1');

    expect(prisma.livestreamBotSession.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false },
    });
    expect(prisma.bot.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.bot.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'bot-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(result).toMatchObject({
      action: 'livestreamBotSessionProcessing',
      failed: 0,
      organizationId: 'org-1',
      processed: 1,
      sessions: 1,
      skipped: 0,
      status: 'completed',
    });
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

    const result = await service.processActiveSessionsForOrganization('org-1');

    expect(result).toMatchObject({
      failed: 0,
      processed: 0,
      sessions: 1,
      skipped: 1,
      status: 'completed',
    });
  });

  it('isolates one session failure and continues processing the next session', async () => {
    prisma.livestreamBotSession.findMany.mockResolvedValue([
      sessionRow('session-1', {
        botId: 'bot-1',
        organizationId: 'org-1',
        status: 'active',
      }),
      sessionRow('session-2', {
        botId: 'bot-2',
        organizationId: 'org-1',
        status: 'active',
      }),
    ]);
    prisma.bot.findFirst
      .mockResolvedValueOnce(
        botRow('bot-1', {
          targets: [
            {
              channelId: 'channel-1',
              isEnabled: true,
              platform: BotPlatform.TWITCH,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(botRow('bot-2'));
    runtimeService.getDeliveryEligibility.mockImplementationOnce(() => {
      throw new Error('provider failed');
    });

    const result = await service.processActiveSessionsForOrganization('org-1');

    expect(loggerService.error).toHaveBeenCalledWith(
      'Failed to process livestream session',
      expect.any(Error),
      {
        botId: 'bot-1',
        organizationId: 'org-1',
        sessionId: 'session-1',
      },
    );
    expect(result).toMatchObject({
      failed: 1,
      processed: 1,
      sessions: 2,
      skipped: 0,
      status: 'completed',
    });
  });

  it('returns a skipped result when the organization has no active sessions', async () => {
    prisma.livestreamBotSession.findMany.mockResolvedValue([
      sessionRow('session-1', {
        botId: 'bot-1',
        organizationId: 'org-1',
        status: 'paused',
      }),
    ]);

    const result = await service.processActiveSessionsForOrganization('org-1');

    expect(prisma.bot.findFirst).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reason: 'no_active_livestream_sessions',
      sessions: 0,
      skipped: 1,
      status: 'skipped',
    });
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
    mongoId: null,
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
