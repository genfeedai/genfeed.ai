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
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

type Row = Record<string, unknown> & {
  config: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
};
type Where = Record<string, unknown>;

describe('ReplyBotConfigsService persistence', () => {
  let rows: Map<string, Row>;
  let service: ReplyBotConfigsService;

  // Every query passes the real CLOUD tenant guard, as in production.
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'ReplyBotConfig',
      operation,
      tenantModelNames: new Set(['ReplyBotConfig']),
    });
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  beforeEach(() => {
    rows = new Map();
    let nextId = 1;

    service = new ReplyBotConfigsService(
      {
        isCloudTenantGuard: true,
        replyBotConfig: {
          create: async (args: { data: Record<string, unknown> }) => {
            guard('create', args);
            const row = {
              ...args.data,
              createdAt: new Date(),
              id: `bot-${nextId++}`,
              isDeleted: false,
              updatedAt: new Date(),
            } as unknown as Row;
            rows.set(row.id, row);
            return row;
          },
          findFirst: async (args: { where: Where }) => {
            guard('findFirst', args);
            return (
              [...rows.values()].find((row) => matches(row, args.where)) ?? null
            );
          },
          update: async (args: {
            data: Record<string, unknown>;
            where: Where;
          }) => {
            guard('update', args);
            const row = [...rows.values()].find((entry) =>
              matches(entry, args.where),
            );
            if (!row) throw new Error('Record to update not found');
            Object.assign(row, args.data, { updatedAt: new Date() });
            return row;
          },
        },
      } as unknown as PrismaService,
      {
        debug: () => {},
        error: () => {},
        log: () => {},
        warn: () => {},
      } as unknown as LoggerService,
    );
  });

  const seed = (row: Partial<Row> & { id: string }) => {
    rows.set(row.id, {
      config: {},
      isDeleted: false,
      organizationId: 'org-1',
      ...row,
    } as Row);
  };

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

    expect(rows.get('bot-1')).toMatchObject({
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
    });
    expect(rows.get('bot-1')).not.toHaveProperty('name');
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

    expect(rows.get('bot-1')?.isActive).toBe(false);
  });

  it('merges config-backed patches inside the request tenant and keeps scalars out of JSON', async () => {
    seed({
      config: { credentialId: 'credential-1', name: 'Old name' },
      id: 'bot-1',
      isActive: false,
    });

    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.patch('bot-1', { isActive: true, name: 'New name' }, []),
    );

    expect(rows.get('bot-1')).toMatchObject({
      config: { credentialId: 'credential-1', name: 'New name' },
      isActive: true,
    });
  });

  it('counts replies, DMs, skips and failures on the bot of the organization', async () => {
    seed({ config: {}, id: 'bot-1' });

    await runWithTenantContext({ organizationId: 'org-1' }, async () => {
      await service.incrementReplyCounters('bot-1', 'org-1');
      await service.incrementDmCounter('bot-1', 'org-1');
      await service.incrementSkippedCounter('bot-1', 'org-1');
      await service.incrementFailedCounter('bot-1', 'org-1');
    });

    expect(rows.get('bot-1')?.config).toMatchObject({
      lastActivityAt: expect.any(String),
      rateLimits: expect.objectContaining({
        currentDayCount: 1,
        currentHourCount: 1,
      }),
      totalDmsSent: 1,
      totalFailed: 1,
      totalRepliesSent: 1,
      totalSkipped: 1,
    });
  });

  it("leaves another organization's bot untouched", async () => {
    seed({ config: {}, id: 'bot-1', organizationId: 'org-2' });

    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.incrementReplyCounters('bot-1', 'org-1'),
    );

    expect(rows.get('bot-1')?.config).toEqual({});
  });
});
