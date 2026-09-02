import { BillingAccountMigrationService } from '@api/collections/billing-accounts/services/billing-account-migration.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('BillingAccountMigrationService', () => {
  const prisma = {
    $transaction: vi.fn(),
    billingAccount: { create: vi.fn() },
    billingAccountMember: { create: vi.fn() },
    billingAccountOrganization: { create: vi.fn() },
    creditBalance: { updateMany: vi.fn() },
    creditTransaction: { updateMany: vi.fn() },
    customer: { updateMany: vi.fn() },
    organization: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    subscription: { updateMany: vi.fn() },
  };
  const logger = { log: vi.fn() };
  const service = new BillingAccountMigrationService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

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
    expect(prisma.organization.updateMany).not.toHaveBeenCalled();
  });

  it('quarantines Stripe identities shared across organizations', async () => {
    prisma.organization.findMany.mockResolvedValue([
      {
        billingAccountId: null,
        customers: [{ id: 'c1', stripeCustomerId: 'cus_shared' }],
        id: 'org_1',
        subscriptions: [],
      },
      {
        billingAccountId: null,
        customers: [{ id: 'c2', stripeCustomerId: 'cus_shared' }],
        id: 'org_2',
        subscriptions: [],
      },
    ]);

    const report = await service.applyUnambiguous();

    expect(report.classified).toEqual([
      expect.objectContaining({ classification: 'duplicate' }),
      expect.objectContaining({ classification: 'duplicate' }),
    ]);
    expect(prisma.billingAccount.create).not.toHaveBeenCalled();
  });

  it('creates and attributes a missing account in one serializable transaction', async () => {
    prisma.organization.findMany.mockResolvedValue([
      {
        billingAccountId: null,
        customers: [{ id: 'c1', stripeCustomerId: 'cus_1' }],
        id: 'org_1',
        label: 'Acme',
        subscriptions: [{ id: 's1' }],
        userId: 'user_1',
      },
    ]);
    prisma.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      userId: 'user_1',
    });
    prisma.billingAccount.create.mockResolvedValue({ id: 'ba_1' });
    prisma.organization.updateMany.mockResolvedValue({ count: 1 });
    prisma.creditTransaction.updateMany.mockResolvedValue({ count: 3 });

    const report = await service.applyUnambiguous();

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.billingAccountMember.create).toHaveBeenCalled();
    expect(prisma.billingAccountOrganization.create).toHaveBeenCalled();
    expect(report).toMatchObject({
      attributedTransactions: 3,
      createdAccounts: 1,
      linkedOrganizations: 1,
    });
  });
});
