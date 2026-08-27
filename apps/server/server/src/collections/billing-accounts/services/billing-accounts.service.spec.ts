import {
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { BillingAccountsService } from '@server/collections/billing-accounts/services/billing-accounts.service';
import { PlanLimitExceededException } from '@server/exceptions/business-logic.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

describe('BillingAccountsService', () => {
  const prisma = {
    $transaction: vi.fn(),
    billingAccount: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    billingAccountMember: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    billingAccountOrganization: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    creditBalance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    creditTransaction: {
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    customer: { updateMany: vi.fn() },
    organization: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const service = new BillingAccountsService(
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

  it('rejects billing administration without a billing role', async () => {
    prisma.billingAccountMember.findFirst.mockResolvedValue(null);

    await expect(
      service.requireRole('ba_1', 'user_1', BillingAccountMemberRole.VIEWER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a second Pro organization link', async () => {
    prisma.billingAccount.findFirst.mockResolvedValue({
      id: 'ba_1',
      isDeleted: false,
      planTier: 'pro',
    });
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.organization.findFirst.mockResolvedValue({
      billingAccountId: null,
      id: 'org_2',
    });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.billingAccountOrganization.count.mockResolvedValue(1);

    await expect(
      service.linkOrganization({
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        organizationId: 'org_2',
      }),
    ).rejects.toBeInstanceOf(PlanLimitExceededException);
  });

  it('atomically merges organization credits into the shared wallet', async () => {
    prisma.billingAccount.findFirst.mockResolvedValue({
      id: 'ba_1',
      isDeleted: false,
      planTier: 'business',
    });
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.organization.findFirst.mockResolvedValue({
      billingAccountId: null,
      id: 'org_2',
    });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.billingAccountOrganization.count.mockResolvedValue(0);
    prisma.creditBalance.findFirst
      .mockResolvedValueOnce({
        balance: 25,
        billingAccountId: null,
        heldAmount: 5,
        id: 'wallet_org',
      })
      .mockResolvedValueOnce({
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 10,
        id: 'wallet_shared',
      });
    prisma.creditBalance.updateMany.mockResolvedValue({ count: 1 });

    await service.linkOrganization({
      actorUserId: 'user_1',
      billingAccountId: 'ba_1',
      organizationId: 'org_2',
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.creditBalance.updateMany).toHaveBeenNthCalledWith(1, {
      data: {
        balance: { increment: 25 },
        heldAmount: { increment: 5 },
        version: { increment: 1 },
      },
      where: {
        billingAccountId: 'ba_1',
        id: 'wallet_shared',
        isDeleted: false,
      },
    });
    expect(prisma.creditBalance.updateMany).toHaveBeenNthCalledWith(2, {
      data: { isDeleted: true },
      where: {
        id: 'wallet_org',
        isDeleted: false,
        organizationId: 'org_2',
        OR: [{ billingAccountId: null }, { billingAccountId: 'ba_1' }],
      },
    });
  });

  it('keeps the source wallet active when the shared wallet changes', async () => {
    prisma.billingAccount.findFirst.mockResolvedValue({
      id: 'ba_1',
      isDeleted: false,
      planTier: 'business',
    });
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.organization.findFirst.mockResolvedValue({
      billingAccountId: null,
      id: 'org_2',
    });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.billingAccountOrganization.count.mockResolvedValue(0);
    prisma.creditBalance.findFirst
      .mockResolvedValueOnce({
        balance: 25,
        billingAccountId: null,
        heldAmount: 5,
        id: 'wallet_org',
      })
      .mockResolvedValueOnce({
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 10,
        id: 'wallet_shared',
      });
    prisma.creditBalance.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.linkOrganization({
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        organizationId: 'org_2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.creditBalance.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects linking an organization owned by another billing account', async () => {
    prisma.billingAccount.findFirst.mockResolvedValue({
      id: 'ba_1',
      isDeleted: false,
      planTier: 'business',
    });
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.organization.findFirst.mockResolvedValue({
      billingAccountId: 'ba_other',
      id: 'org_2',
    });

    await expect(
      service.linkOrganization({
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        organizationId: 'org_2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.billingAccountOrganization.create).not.toHaveBeenCalled();
    expect(prisma.creditBalance.updateMany).not.toHaveBeenCalled();
  });

  it('preserves the billing account when a role is revoked', async () => {
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.billingAccountMember.updateMany.mockResolvedValue({ count: 1 });

    await service.revokeRole({
      actorUserId: 'owner_1',
      billingAccountId: 'ba_1',
      userId: 'admin_1',
    });

    expect(prisma.billingAccount.update).not.toHaveBeenCalled();
    expect(prisma.billingAccountMember.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: {
        billingAccountId: 'ba_1',
        isDeleted: false,
        userId: 'admin_1',
      },
    });
  });

  it('creates an unprovisioned account when an organization has none', async () => {
    prisma.organization.findFirst.mockResolvedValue({
      billingAccountId: null,
      id: 'org_1',
      label: 'Acme',
    });
    prisma.billingAccountMember.findMany.mockResolvedValue([]);
    prisma.billingAccount.create.mockResolvedValue({
      id: 'ba_new',
      label: 'Acme',
      status: BillingAccountStatus.UNPROVISIONED,
    });
    prisma.billingAccount.findFirst.mockResolvedValue({
      id: 'ba_new',
      isDeleted: false,
      planTier: null,
    });
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.billingAccountOrganization.count.mockResolvedValue(0);
    prisma.creditBalance.findFirst.mockResolvedValue(null);

    const account = await service.ensureForOrganization({
      organizationId: 'org_1',
      userId: 'user_1',
    });

    expect(account.id).toBe('ba_new');
    expect(prisma.billingAccountMember.create).toHaveBeenCalled();
    expect(prisma.billingAccountOrganization.create).toHaveBeenCalledWith({
      data: {
        billingAccountId: 'ba_new',
        organizationId: 'org_1',
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
  });
});
