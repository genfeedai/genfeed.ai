vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

type MockDelegate = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe('MonitoredAccountsService active filters', () => {
  let service: MonitoredAccountsService;
  let delegate: MockDelegate;

  beforeEach(() => {
    delegate = {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          id: 'account-1',
          isDeleted: false,
          updatedAt: new Date(),
        }),
      ),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          id: 'account-1',
          isDeleted: false,
          updatedAt: new Date(),
        }),
      ),
    };

    service = new MonitoredAccountsService(
      { monitoredAccount: delegate } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filters active accounts by the isActive column, not the config blob', async () => {
    await service.findActiveByOrganization('org-1');

    expect(delegate.findMany).toHaveBeenCalledWith({
      where: { isActive: true, isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('filters bot-config accounts by the isActive column', async () => {
    await service.findByBotConfig('bot-1', 'org-1');

    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        botConfigId: 'bot-1',
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('queries external account ids inside the tenant scope', async () => {
    delegate.findFirst.mockResolvedValue({ id: 'account-1' });

    await expect(
      service.findByExternalId('platform-user-1', 'org-1'),
    ).resolves.toEqual({ id: 'account-1' });
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        config: { equals: 'platform-user-1', path: ['externalId'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('writes scalar relations and packs platform details into config', async () => {
    await service.create(
      {
        botConfigId: 'bot-1',
        brandId: 'brand-1',
        credentialId: 'credential-1',
        externalId: 'platform-user-1',
        organizationId: 'org-1',
        platform: 'twitter' as never,
        userId: 'user-1',
        username: 'alice',
      },
      [],
    );

    expect(delegate.create).toHaveBeenCalledWith({
      data: {
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
      },
    });
  });

  it('merges config-backed patches without dropping stored fields', async () => {
    delegate.findFirst.mockResolvedValue({
      config: { externalId: 'platform-user-1', username: 'old-name' },
      id: 'account-1',
    });

    await service.patch('account-1', { username: 'new-name' }, []);

    expect(delegate.update).toHaveBeenCalledWith({
      data: {
        config: {
          externalId: 'platform-user-1',
          username: 'new-name',
        },
      },
      where: { id: 'account-1' },
    });
  });
  it('scopes the config pre-read by the request tenant in CLOUD mode', async () => {
    delegate.findFirst.mockResolvedValue({
      config: { username: 'old-name' },
      id: 'account-1',
    });

    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.patch('account-1', { username: 'new-name' }, []),
    );

    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-1', isDeleted: false, organizationId: 'org-1' },
    });
    expectCloudGuardPasses('MonitoredAccount', 'findFirst', delegate.findFirst);
  });

  it('threads the organization into cursor and counter writes', async () => {
    delegate.findFirst.mockResolvedValue({
      config: {},
      id: 'account-1',
      isDeleted: false,
    });

    await runWithTenantContext({ organizationId: 'org-1' }, async () => {
      await service.updateLastChecked('account-1', 'org-1', 'tweet-1');
      await service.updateLastProcessed('account-1', 'org-1', 'tweet-2');
      await service.incrementProcessedCount('account-1', 'org-1');
      await service.incrementRepliesCount('account-1', 'org-1');
    });

    expectCloudGuardPasses('MonitoredAccount', 'findFirst', delegate.findFirst);
    expectCloudGuardPasses('MonitoredAccount', 'update', delegate.update);
    expect(delegate.update).toHaveBeenCalledTimes(4);
  });
});
