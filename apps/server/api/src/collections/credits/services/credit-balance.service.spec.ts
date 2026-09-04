import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('CreditBalanceService', () => {
  const prisma = {
    $executeRaw: vi.fn(),
    creditBalance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = { warn: vi.fn() };
  const service = new CreditBalanceService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tenant-scopes the billing-account wallet lookup', async () => {
    prisma.creditBalance.findFirst.mockResolvedValue({
      balance: 100,
      billingAccountId: 'ba_1',
      heldAmount: 6,
      id: 'balance_1',
      isDeleted: false,
      organizationId: 'org_1',
      version: 1,
    });

    await service.getOrCreateBalance('org_1', undefined, 'ba_1');

    expect(prisma.creditBalance.findFirst).toHaveBeenCalledWith({
      where: {
        billingAccountId: 'ba_1',
        isDeleted: false,
        organizationId: 'org_1',
      },
    });
  });

  it('tenant-scopes the wallet read after a balance mutation', async () => {
    const balance = {
      balance: 100,
      billingAccountId: 'ba_1',
      heldAmount: 6,
      id: 'balance_1',
      isDeleted: false,
      organizationId: 'org_1',
      version: 1,
    };
    prisma.creditBalance.findFirst
      .mockResolvedValueOnce(balance)
      .mockResolvedValueOnce({ ...balance, heldAmount: 4, version: 2 });
    prisma.$executeRaw.mockResolvedValue(1);

    await service.applyDelta('org_1', {
      billingAccountId: 'ba_1',
      heldDelta: -2,
    });

    expect(prisma.creditBalance.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'balance_1',
        isDeleted: false,
        organizationId: 'org_1',
      },
    });
  });
});
