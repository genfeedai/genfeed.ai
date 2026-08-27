import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { PlanLimitExceededException } from '@api/helpers/exceptions/business/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';

describe('BillingAccountsService', () => {
  const prisma = {
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
