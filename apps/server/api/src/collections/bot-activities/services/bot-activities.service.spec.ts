import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BotActivitiesService', () => {
  let create: ReturnType<typeof vi.fn>;
  let count: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let service: BotActivitiesService;

  beforeEach(() => {
    create = vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'activity-1', ...data }),
    );
    findMany = vi.fn().mockResolvedValue([]);
    count = vi.fn().mockResolvedValue(0);
    service = new BotActivitiesService(
      {
        botActivity: {
          count,
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

    count.mockResolvedValue(1);

    const result = await service.findWithFilters('org-1', undefined, {});

    expect(result.docs[0]).toMatchObject({
      botType: 'reply',
      brandId: 'brand-1',
      monitoredAccountId: 'account-1',
      organizationId: 'org-1',
      replyBotConfigId: 'config-1',
      userId: 'user-1',
    });
    expect(result.docs[0]).not.toHaveProperty('brand');
    expect(result.docs[0]).not.toHaveProperty('monitoredAccount');
    expect(result.docs[0]).not.toHaveProperty('organization');
    expect(result.docs[0]).not.toHaveProperty('replyBotConfig');
    expect(result.docs[0]).not.toHaveProperty('user');
  });

  describe('findWithFilters pagination', () => {
    it('pages in SQL with skip/take, a scoped where and a count', async () => {
      findMany.mockResolvedValue([{ data: {}, id: 'a-3' }]);
      count.mockResolvedValue(45);

      const result = await service.findWithFilters('org-1', 'brand-1', {
        limit: 20,
        page: 3,
      });

      const args = findMany.mock.calls[0][0];
      expect(args).toMatchObject({
        orderBy: { createdAt: 'desc' },
        skip: 40,
        take: 20,
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(count).toHaveBeenCalledWith({ where: args.where });
      expect(result).toMatchObject({
        hasNextPage: false,
        hasPrevPage: true,
        limit: 20,
        page: 3,
        totalDocs: 45,
        totalPages: 3,
      });
    });

    it('defaults to page 1 of 20 rows', async () => {
      await service.findWithFilters('org-1', undefined, {});

      expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 20 });
    });

    it('pushes status, botType and the date range into the where', async () => {
      await service.findWithFilters('org-1', undefined, {
        botType: 'reply' as never,
        fromDate: '2026-01-01T00:00:00.000Z',
        status: 'completed' as never,
        toDate: '2026-02-01T00:00:00.000Z',
      });

      const { where } = findMany.mock.calls[0][0];
      expect(where.AND).toEqual([
        { data: { equals: 'reply', path: ['botType'] } },
        { data: { equals: 'completed', path: ['status'] } },
      ]);
      expect(where.createdAt).toEqual({
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-02-01T00:00:00.000Z'),
      });
    });
  });

  describe('getStats', () => {
    it('counts in the database instead of loading rows', async () => {
      count.mockImplementation(
        ({ where }: { where: { data?: { path: string[] } } }) => {
          const path = where.data?.path?.[0];
          if (path === 'status') return Promise.resolve(2);
          if (path === 'replyTweetId') return Promise.resolve(5);
          if (path === 'dmSent') return Promise.resolve(3);
          return Promise.resolve(10);
        },
      );

      const stats = await service.getStats('org-1', 'brand-1', 'config-1');

      expect(findMany).not.toHaveBeenCalled();
      expect(stats).toEqual({
        completed: 2,
        failed: 2,
        pending: 2,
        skipped: 2,
        total: 10,
        totalDms: 3,
        totalReplies: 5,
      });
      expect(count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          replyBotConfigId: 'config-1',
        }),
      });
      expect(count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          data: { equals: 'completed', path: ['status'] },
          organizationId: 'org-1',
        }),
      });
    });
  });
});
