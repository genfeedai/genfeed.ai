import { BillingAccountMigrationService } from '@api/collections/billing-accounts/services/billing-account-migration.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('BillingAccountMigrationService', () => {
  const prisma = {
    billingAccount: { create: vi.fn() },
    creditTransaction: { updateMany: vi.fn() },
    organization: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = { log: vi.fn() };
  const service = new BillingAccountMigrationService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );

  it('classifies duplicates without writing in dry run', async () => {
    prisma.organization.findMany.mockResolvedValue([
      {
        billingAccountId: 'ba_1',
        customers: [{ id: 'c1' }, { id: 'c2' }],
        id: 'org_1',
        subscriptions: [{ id: 's1' }],
      },
    ]);

    const report = await service.dryRun();

    expect(report.dryRun).toBe(true);
    expect(report.classified[0]?.classification).toBe('duplicate');
    expect(prisma.billingAccount.create).not.toHaveBeenCalled();
  });

  it('does not insert a replacement for an unambiguous identity during dry run', async () => {
    prisma.organization.findMany.mockResolvedValue([
      {
        billingAccountId: 'ba_1',
        customers: [{ id: 'c1', stripeCustomerId: 'cus_1' }],
        id: 'org_2',
        subscriptions: [{ id: 's1' }],
      },
    ]);

    const report = await service.dryRun();

    expect(report.classified[0]?.classification).toBe('unambiguous');
    expect(report.createdAccounts).toBe(0);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});
