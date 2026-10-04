import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { creditUsageWhere } from '@api/collections/credits/services/credit-usage.util';
import { PlanLimitExceededException } from '@api/exceptions/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
} from '@genfeedai/contracts';
import { BillingAccountSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('BillingAccountsService', () => {
  const prisma = {
    $transaction: vi.fn(),
    billingAccount: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
    creditReservation: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    creditTransaction: {
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    customer: { updateMany: vi.fn() },
    member: { findFirst: vi.fn() },
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
    prisma.member.findFirst.mockResolvedValue({
      role: { key: 'owner' },
      roleKey: 'owner',
    });
    prisma.creditReservation.findFirst.mockResolvedValue(null);
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
    // First read (unlinked, before tx.organization.update); second read is
    // resolveBillingAccountAccess (#5217) after that update, once the link
    // is live.
    prisma.organization.findFirst
      .mockResolvedValueOnce({ billingAccountId: null, id: 'org_2' })
      .mockResolvedValueOnce({ billingAccountId: 'ba_1', id: 'org_2' });
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
    expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
      data: { billingAccountId: 'ba_1' },
      where: {
        isDeleted: false,
        organizationId: 'org_2',
        status: 'RESERVED',
      },
    });
  });

  it('rejects linking without administration rights in the target organization', async () => {
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
    prisma.member.findFirst.mockResolvedValue(null);

    await expect(
      service.linkOrganization({
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        organizationId: 'org_2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.billingAccountOrganization.create).not.toHaveBeenCalled();
  });

  it('detaches an organization and provisions its replacement atomically', async () => {
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.billingAccountOrganization.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.billingAccount.create.mockResolvedValue({ id: 'ba_replacement' });
    prisma.creditBalance.findFirst.mockResolvedValue(null);

    await service.detachOrganization({
      actorUserId: 'user_1',
      billingAccountId: 'ba_1',
      organizationId: 'org_2',
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      data: { billingAccountId: 'ba_replacement' },
      where: { id: 'org_2' },
    });
  });

  it('detaches a sibling organization under that organization tenant, with only the sibling lookup cross-org (CLOUD guard)', async () => {
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.billingAccountOrganization.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.billingAccount.create.mockResolvedValue({ id: 'ba_replacement' });
    prisma.creditBalance.findFirst.mockResolvedValue({
      id: 'cb_1',
      organizationId: 'org_2',
    });
    const tenantSeen: Array<string | undefined> = [];
    prisma.member.findFirst.mockImplementation(async () => {
      tenantSeen.push(getTenantContext()?.organizationId);
      return { role: { key: 'owner' }, roleKey: 'owner' };
    });
    let siblingLookupWasCrossOrg = false;
    prisma.billingAccountOrganization.findFirst.mockImplementation(async () => {
      siblingLookupWasCrossOrg = isCrossOrgUnsafe();
      return { organizationId: 'org_3' };
    });

    // The session organization is org_1; the detached sibling is org_2.
    await runWithTenantContext({ organizationId: 'org_1' }, () =>
      service.detachOrganization({
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        organizationId: 'org_2',
      }),
    );

    expect(tenantSeen).toEqual(['org_2']);
    expect(siblingLookupWasCrossOrg).toBe(true);
    expect(prisma.creditBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { organizationId: 'org_3' } }),
    );
  });

  it('refuses to detach for a normal member who does not administer the detached organization (CLOUD guard)', async () => {
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.member.findFirst.mockResolvedValue({
      role: { key: 'viewer' },
      roleKey: 'viewer',
    });

    await expect(
      runWithTenantContext({ organizationId: 'org_1' }, () =>
        service.detachOrganization({
          actorUserId: 'user_1',
          billingAccountId: 'ba_1',
          organizationId: 'org_2',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.billingAccountOrganization.updateMany).not.toHaveBeenCalled();
  });

  it('rejects detaching an organization with unsettled reservations', async () => {
    prisma.billingAccountMember.findFirst.mockResolvedValue({
      role: BillingAccountMemberRole.OWNER,
    });
    prisma.creditReservation.findFirst.mockResolvedValue({ id: 'res_1' });

    await expect(
      service.detachOrganization({
        actorUserId: 'user_1',
        billingAccountId: 'ba_1',
        organizationId: 'org_2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.billingAccountOrganization.updateMany).not.toHaveBeenCalled();
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
    // First read (unlinked, before tx.organization.update); second read is
    // resolveBillingAccountAccess (#5217) after that update, once the link
    // is live.
    prisma.organization.findFirst
      .mockResolvedValueOnce({ billingAccountId: null, id: 'org_2' })
      .mockResolvedValueOnce({ billingAccountId: 'ba_1', id: 'org_2' });
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

  it('fails closed when attaching a conflicting Stripe customer', async () => {
    prisma.billingAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.attachStripeCustomer('ba_1', 'cus_new'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.billingAccount.updateMany).toHaveBeenCalledWith({
      data: {
        status: BillingAccountStatus.ACTIVE,
        stripeCustomerId: 'cus_new',
      },
      where: {
        id: 'ba_1',
        isDeleted: false,
        OR: [{ stripeCustomerId: null }, { stripeCustomerId: 'cus_new' }],
      },
    });
  });

  it.each([
    ['without an existing account', false],
    ['separately from a full existing account', true],
  ])(
    'creates an unprovisioned account %s',
    async (_case, isSeparateAccount) => {
      // Calls 1-2 (ensureForOrganization's own check, then
      // tx.organization.findFirst inside linkOrganization) precede the link;
      // the fallback (call 3+) is resolveBillingAccountAccess (#5217) reading
      // the organization after tx.organization.update makes the link live.
      prisma.organization.findFirst
        .mockResolvedValueOnce({
          billingAccountId: null,
          id: 'org_1',
          label: 'Acme',
        })
        .mockResolvedValueOnce({
          billingAccountId: null,
          id: 'org_1',
          label: 'Acme',
        })
        .mockResolvedValue({
          billingAccountId: 'ba_new',
          id: 'org_1',
          label: 'Acme',
        });
      prisma.billingAccountMember.findMany.mockResolvedValue(
        isSeparateAccount
          ? [
              {
                billingAccount: {
                  id: 'ba_existing',
                  isDeleted: false,
                  planTier: 'free',
                },
              },
            ]
          : [],
      );
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
      prisma.billingAccountOrganization.count.mockImplementation(
        async ({ where }) => (where.billingAccountId === 'ba_existing' ? 1 : 0),
      );
      prisma.creditBalance.findFirst.mockResolvedValue(null);

      const account = await service.ensureForOrganization({
        isSeparateAccount,
        organizationId: 'org_1',
        planTier: 'free',
        userId: 'user_1',
      });

      expect(account.id).toBe('ba_new');
      expect(prisma.billingAccount.create).toHaveBeenCalledWith({
        data: {
          label: 'Acme',
          planTier: 'free',
          status: BillingAccountStatus.UNPROVISIONED,
        },
      });
      if (isSeparateAccount) {
        expect(prisma.billingAccountMember.findMany).not.toHaveBeenCalled();
      }
      expect(prisma.billingAccountMember.create).toHaveBeenCalled();
      expect(prisma.billingAccountOrganization.create).toHaveBeenCalledWith({
        data: {
          billingAccountId: 'ba_new',
          organizationId: 'org_1',
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });
    },
  );

  it('keeps the owned-account organization limit for ordinary provisioning', async () => {
    prisma.organization.findFirst.mockResolvedValue({
      billingAccountId: null,
      id: 'org_2',
      label: 'Second Org',
    });
    prisma.billingAccountMember.findMany.mockResolvedValue([
      {
        billingAccount: {
          id: 'ba_existing',
          isDeleted: false,
          planTier: 'free',
        },
      },
    ]);
    prisma.billingAccountOrganization.count.mockResolvedValue(1);

    await expect(
      service.ensureForOrganization({
        organizationId: 'org_2',
        userId: 'user_1',
      }),
    ).rejects.toBeInstanceOf(PlanLimitExceededException);

    expect(prisma.billingAccount.create).not.toHaveBeenCalled();
    expect(prisma.billingAccountOrganization.create).not.toHaveBeenCalled();
  });

  describe('getSnapshot (#5374)', () => {
    beforeEach(() => {
      prisma.organization.findFirst.mockResolvedValue({
        billingAccountId: 'ba_1',
        id: 'org_1',
      });
      prisma.billingAccount.findFirst.mockResolvedValue({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'ba_1',
        isDeleted: false,
        label: 'Shared Account',
        planTier: 'pro',
        status: BillingAccountStatus.ACTIVE,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });
    });

    it('returns the full snapshot, including another linked organization, to a VIEWER', async () => {
      prisma.billingAccountMember.findFirst.mockResolvedValue({
        role: BillingAccountMemberRole.VIEWER,
      });
      prisma.billingAccountOrganization.findMany.mockResolvedValue([
        {
          budgetPolicy: null,
          monthlyBudgetCredits: null,
          organization: { label: 'Org One' },
          organizationId: 'org_1',
          status: BillingAccountOrganizationStatus.LINKED,
        },
        {
          budgetPolicy: null,
          monthlyBudgetCredits: null,
          organization: { label: 'Org Two' },
          organizationId: 'org_2',
          status: BillingAccountOrganizationStatus.LINKED,
        },
      ]);
      prisma.creditBalance.findFirst.mockResolvedValue({
        balance: 100,
        heldAmount: 10,
      });
      prisma.creditTransaction.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          where.amount.lt === 0
            ? [
                // Legacy negative-signed deduction counts its magnitude.
                {
                  _sum: { amount: -4 },
                  category: 'deduct',
                  organizationId: 'org_1',
                },
              ]
            : [
                {
                  _sum: { amount: 5 },
                  category: 'deduct',
                  organizationId: 'org_1',
                },
                {
                  _sum: { amount: 2 },
                  category: 'refund',
                  organizationId: 'org_1',
                },
                {
                  _sum: { amount: 9 },
                  category: 'deduct',
                  organizationId: 'org_2',
                },
              ],
        ),
      );
      prisma.subscription.findFirst.mockResolvedValue({
        currentPeriodEnd: null,
        status: 'active',
      });

      const snapshot = await service.getSnapshot('org_1', 'user_viewer');

      expect(snapshot.kind).toBe('account');
      expect(snapshot.callerRole).toBe(BillingAccountMemberRole.VIEWER);
      if (snapshot.kind !== 'account') {
        throw new Error('expected full account snapshot');
      }
      expect(snapshot.wallet).toEqual({
        available: 90,
        held: 10,
        settled: 100,
      });
      expect(
        snapshot.linkedOrganizations.map((link) => link.organizationId),
      ).toEqual(['org_1', 'org_2']);
      // Usage nets refunds and skips referral reward reversals (#6008).
      expect(snapshot.linkedOrganizations.map((link) => link.usage)).toEqual([
        7, 9,
      ]);
      expect(prisma.creditTransaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['organizationId', 'category'],
          where: expect.objectContaining({
            billingAccountId: 'ba_1',
            ...creditUsageWhere(),
          }),
        }),
      );
    });

    it('returns only the caller organization usage/budget/link status to a caller with no billing role', async () => {
      prisma.billingAccountMember.findFirst.mockResolvedValue(null);
      prisma.billingAccountOrganization.findFirst.mockResolvedValue({
        billingAccountId: 'ba_1',
        budgetPolicy: 'WARNING',
        monthlyBudgetCredits: 500,
        organizationId: 'org_1',
        status: BillingAccountOrganizationStatus.LINKED,
      });
      prisma.creditTransaction.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          where.amount.lt === 0
            ? [{ _sum: { amount: -3 }, category: 'deduct' }]
            : [
                { _sum: { amount: 11 }, category: 'deduct' },
                { _sum: { amount: 2 }, category: 'refund' },
              ],
        ),
      );

      const snapshot = await service.getSnapshot('org_1', 'user_plain_member');

      expect(snapshot).toEqual({
        budgetPolicy: 'WARNING',
        callerRole: null,
        capabilities: {
          canCheckout: false,
          canDetachOrganization: false,
          canLinkOrganization: false,
          canManageBudgets: false,
          canManageMembers: false,
          canOpenPortal: false,
        },
        isLinked: true,
        id: 'ba_1',
        kind: 'organization',
        monthlyBudgetCredits: 500,
        organizationId: 'org_1',
        usage: 12,
      });

      expect(BillingAccountSerializer.serialize(snapshot).data).toMatchObject({
        id: 'ba_1',
        type: 'billing-account',
        attributes: { kind: 'organization', organizationId: 'org_1' },
      });

      // No cross-organization or wallet/subscription reads at all — this is
      // the enforcement point, not just the returned shape (#5374).
      expect(prisma.billingAccountOrganization.findMany).not.toHaveBeenCalled();
      expect(prisma.creditBalance.findFirst).not.toHaveBeenCalled();
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();

      expect(prisma.billingAccountOrganization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            billingAccountId: 'ba_1',
            organizationId: 'org_1',
          }),
        }),
      );
      expect(prisma.creditTransaction.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.creditTransaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['category'],
          where: expect.objectContaining({
            billingAccountId: 'ba_1',
            organizationId: 'org_1',
            ...creditUsageWhere(),
          }),
        }),
      );
    });
  });
});
