vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

type MockDelegate = {
  findMany: ReturnType<typeof vi.fn>;
};

describe('MonitoredAccountsService active filters', () => {
  let service: MonitoredAccountsService;
  let delegate: MockDelegate;

  beforeEach(() => {
    delegate = { findMany: vi.fn().mockResolvedValue([]) };

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
});
