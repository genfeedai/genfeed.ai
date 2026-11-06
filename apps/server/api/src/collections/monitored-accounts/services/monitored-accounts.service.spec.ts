vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

type Row = Record<string, unknown> & {
  config: Record<string, unknown>;
  id: string;
};
type Where = Record<string, unknown>;
type CreateInput = Parameters<MonitoredAccountsService['create']>[0];

describe('MonitoredAccountsService persistence', () => {
  let rows: Row[];
  let service: MonitoredAccountsService;

  // Every query passes the real CLOUD tenant guard, as in production.
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'MonitoredAccount',
      operation,
      tenantModelNames: new Set(['MonitoredAccount']),
    });

  // Primitive equality plus the JSON-path `equals` filter the service uses.
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([key, expected]) => {
      if (expected && typeof expected === 'object' && 'path' in expected) {
        const { equals, path } = expected as {
          equals: unknown;
          path: string[];
        };
        return (
          path.reduce<unknown>(
            (value, segment) => (value as Record<string, unknown>)?.[segment],
            row[key],
          ) === equals
        );
      }
      return row[key] === expected;
    });
  const matching = (where: Where) => rows.filter((row) => matches(row, where));

  beforeEach(() => {
    rows = [];
    service = new MonitoredAccountsService(
      {
        isCloudTenantGuard: true,
        monitoredAccount: {
          create: async (args: { data: Record<string, unknown> }) => {
            guard('create', args);
            const row = {
              ...args.data,
              createdAt: new Date(),
              id: `account-${rows.length + 1}`,
              isDeleted: false,
              updatedAt: new Date(),
            } as unknown as Row;
            rows.push(row);
            return row;
          },
          findFirst: async (args: { where: Where }) => {
            guard('findFirst', args);
            return matching(args.where)[0] ?? null;
          },
          findMany: async (args: { where: Where }) => {
            guard('findMany', args);
            return matching(args.where);
          },
          update: async (args: {
            data: Record<string, unknown>;
            where: Where;
          }) => {
            guard('update', args);
            const row = matching(args.where)[0];
            if (!row) throw new Error('Record to update not found');
            Object.assign(row, args.data);
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

  const seed = (id: string, overrides: Partial<Row> = {}) => {
    rows.push({
      botConfigId: 'bot-1',
      config: { externalId: `external-${id}`, isActive: false },
      id,
      isActive: true,
      isDeleted: false,
      organizationId: 'org-1',
      ...overrides,
    });
  };
  const ids = (found: Array<{ id: string }>) => found.map(({ id }) => id);

  it('lists active accounts by the isActive column, not the config blob', async () => {
    seed('active');
    seed('paused', { config: { isActive: true }, isActive: false });
    seed('deleted', { isDeleted: true });
    seed('other-org', { organizationId: 'org-2' });

    await expect(
      service.findActiveByOrganization('org-1').then(ids),
    ).resolves.toEqual(['active']);
  });

  it('lists the active accounts of one bot config', async () => {
    seed('bot-1-active');
    seed('bot-2-active', { botConfigId: 'bot-2' });
    seed('bot-1-paused', { isActive: false });

    await expect(
      service.findByBotConfig('bot-1', 'org-1').then(ids),
    ).resolves.toEqual(['bot-1-active']);
  });

  it('finds an external account id only inside the tenant', async () => {
    seed('foreign', {
      config: { externalId: 'platform-user-1' },
      organizationId: 'org-2',
    });
    seed('mine', { config: { externalId: 'platform-user-1' } });

    await expect(
      service.findByExternalId('platform-user-1', 'org-1'),
    ).resolves.toMatchObject({ id: 'mine' });
  });

  it('writes scalar relations and packs platform details into config', async () => {
    await service.create(
      {
        botConfigId: 'bot-1',
        brandId: 'brand-1',
        credentialId: 'credential-1',
        externalId: 'platform-user-1',
        organizationId: 'org-1',
        platform: 'twitter',
        userId: 'user-1',
        username: 'alice',
      } as unknown as CreateInput,
      [],
    );

    expect(rows[0]).toMatchObject({
      botConfigId: 'bot-1',
      brandId: 'brand-1',
      config: {
        externalId: 'platform-user-1',
        platform: 'twitter',
        username: 'alice',
      },
      credentialId: 'credential-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('merges config-backed patches inside the request tenant without dropping stored fields', async () => {
    seed('account-1', {
      config: { externalId: 'platform-user-1', username: 'old-name' },
    });

    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.patch('account-1', { username: 'new-name' }, []),
    );

    expect(rows[0]?.config).toEqual({
      externalId: 'platform-user-1',
      username: 'new-name',
    });
  });

  it('records cursors and counters on the account of the organization', async () => {
    seed('account-1', { config: {} });

    await runWithTenantContext({ organizationId: 'org-1' }, async () => {
      await service.updateLastChecked('account-1', 'org-1', 'tweet-1');
      await service.updateLastProcessed('account-1', 'org-1', 'tweet-2');
      await service.incrementProcessedCount('account-1', 'org-1');
      await service.incrementRepliesCount('account-1', 'org-1');
    });

    const stored = JSON.stringify(rows[0]);
    expect(stored).toContain('tweet-1');
    expect(stored).toContain('tweet-2');
  });
});
