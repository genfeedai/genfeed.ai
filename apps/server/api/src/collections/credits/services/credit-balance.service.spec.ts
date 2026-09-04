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

  it('finds a shared billing-account wallet owned by another organization', async () => {
    prisma.creditBalance.findFirst.mockResolvedValue({
      balance: 100,
      billingAccountId: 'ba_1',
      heldAmount: 6,
      id: 'balance_1',
      isDeleted: false,
      organizationId: 'org_1',
      version: 1,
    });

    await service.getOrCreateBalance('org_2', undefined, 'ba_1');

    expect(prisma.creditBalance.findFirst).toHaveBeenCalledWith({
      where: {
        billingAccountId: 'ba_1',
        isDeleted: false,
      },
    });
  });

  it.each(['org_1', null])(
    'mutates the shared wallet owned by %s',
    async (walletOrganizationId) => {
      const balance = {
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 6,
        id: 'balance_1',
        isDeleted: false,
        organizationId: walletOrganizationId,
        version: 1,
      };
      prisma.creditBalance.findFirst
        .mockResolvedValueOnce(balance)
        .mockResolvedValueOnce({ ...balance, heldAmount: 4, version: 2 });
      prisma.$executeRaw.mockResolvedValue(1);

      await service.applyDelta('org_2', {
        billingAccountId: 'ba_1',
        heldDelta: -2,
      });

      const mutation = prisma.$executeRaw.mock.calls[0]?.[0];
      expect(mutation.values).toContain(walletOrganizationId);
      expect(mutation.values).not.toContain('org_2');
      expect(prisma.creditBalance.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          id: 'balance_1',
          isDeleted: false,
          organizationId: walletOrganizationId,
        },
      });
    },
  );
});
