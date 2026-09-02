import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BotActivitiesService', () => {
  let create: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let service: BotActivitiesService;

  beforeEach(() => {
    create = vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'activity-1', ...data }),
    );
    findMany = vi.fn().mockResolvedValue([]);
    service = new BotActivitiesService(
      {
        botActivity: {
          create,
          findMany,
        },
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('keeps canonical identity in scalar columns and provider fields in JSON', async () => {
    await service.create({
      brandId: 'brand-1',
      data: {
        brand: 'stale-brand-alias',
        brandId: 'stale-brand-id',
        externalConversationId: 'conversation-1',
        organization: 'stale-org-alias',
        organizationId: 'stale-org-id',
        user: 'stale-user-alias',
        userId: 'stale-user-id',
      },
      organizationId: 'org-1',
      providerActivityId: 'provider-activity-1',
      userId: 'user-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        data: {
          externalConversationId: 'conversation-1',
          providerActivityId: 'provider-activity-1',
        },
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
  });

  it('normalizes stale JSON identity from canonical scalar columns', async () => {
    findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        data: {
          botType: 'reply',
          brand: 'stale-brand-alias',
          brandId: 'stale-brand-id',
          monitoredAccount: 'stale-account-alias',
          monitoredAccountId: 'stale-account-id',
          organization: 'stale-org-alias',
          organizationId: 'stale-org-id',
          replyBotConfig: 'stale-config-alias',
          replyBotConfigId: 'stale-config-id',
          user: 'stale-user-alias',
          userId: 'stale-user-id',
        },
        id: 'activity-1',
        isDeleted: false,
        monitoredAccountId: 'account-1',
        organizationId: 'org-1',
        replyBotConfigId: 'config-1',
        userId: 'user-1',
      },
    ]);

    const result = await service.findWithFilters('org-1', undefined, {});

    expect(result.activities[0]).toMatchObject({
      botType: 'reply',
      brandId: 'brand-1',
      monitoredAccountId: 'account-1',
      organizationId: 'org-1',
      replyBotConfigId: 'config-1',
      userId: 'user-1',
    });
    expect(result.activities[0]).not.toHaveProperty('brand');
    expect(result.activities[0]).not.toHaveProperty('monitoredAccount');
    expect(result.activities[0]).not.toHaveProperty('organization');
    expect(result.activities[0]).not.toHaveProperty('replyBotConfig');
    expect(result.activities[0]).not.toHaveProperty('user');
  });
});
