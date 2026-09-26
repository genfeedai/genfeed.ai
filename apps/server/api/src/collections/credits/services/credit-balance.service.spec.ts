import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

const guardQuery = (model: string, args: unknown) =>
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model,
    operation: 'findFirst',
    tenantModelNames: new Set(['CreditBalance', 'BillingAccountOrganization']),
  });

describe('CreditBalanceService', () => {
  const prisma = {
    $executeRaw: vi.fn(),
    billingAccount: {
      findFirst: vi.fn(),
    },
    billingAccountOrganization: {
      findFirst: vi.fn(),
    },
    creditBalance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new CreditBalanceService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findFirst.mockResolvedValue(null);
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.billingAccount.findFirst.mockResolvedValue(null);
  });

  it('returns the wallet the organization owns directly, without consulting billing-account relations', async () => {
    prisma.creditBalance.findFirst.mockResolvedValue({
      balance: 100,
      billingAccountId: 'ba_1',
      heldAmount: 6,
      id: 'balance_1',
      isDeleted: false,
      organizationId: 'org_2',
      version: 1,
    });

    const balance = await service.getOrCreateBalance(
      'org_2',
      undefined,
      'ba_1',
    );

    expect(balance.id).toBe('balance_1');
    expect(prisma.creditBalance.findFirst).toHaveBeenCalledWith({
      where: {
        billingAccountId: 'ba_1',
        isDeleted: false,
        organizationId: 'org_2',
      },
    });
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(prisma.billingAccountOrganization.findFirst).not.toHaveBeenCalled();
  });

  it('finds a shared wallet through the organization directly attached to its billing account', async () => {
    prisma.creditBalance.findFirst.mockResolvedValue(null);
    prisma.organization.findFirst.mockResolvedValue({
      billingAccount: {
        creditBalances: [
          {
            balance: 100,
            billingAccountId: 'ba_1',
            heldAmount: 6,
            id: 'balance_1',
            isDeleted: false,
            organizationId: null,
            version: 1,
          },
        ],
      },
    });

    const balance = await service.getOrCreateBalance(
      'org_2',
      undefined,
      'ba_1',
    );

    expect(balance.id).toBe('balance_1');
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      select: {
        billingAccount: {
          select: {
            creditBalances: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              where: { billingAccountId: 'ba_1', isDeleted: false },
            },
          },
          where: { isDeleted: false },
        },
      },
      where: { id: 'org_2', isDeleted: false },
    });
    expect(prisma.billingAccountOrganization.findFirst).not.toHaveBeenCalled();
  });

  it('finds a shared wallet only through a LINKED, non-deleted BillingAccountOrganization row', async () => {
    prisma.creditBalance.findFirst.mockResolvedValue(null);
    prisma.organization.findFirst.mockResolvedValue({ billingAccount: null });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue({
      billingAccount: {
        creditBalances: [
          {
            balance: 100,
            billingAccountId: 'ba_1',
            heldAmount: 6,
            id: 'balance_1',
            isDeleted: false,
            organizationId: 'org_1',
            version: 1,
          },
        ],
      },
    });

    const balance = await service.getOrCreateBalance(
      'org_2',
      undefined,
      'ba_1',
    );

    expect(balance.id).toBe('balance_1');
    // BillingAccountOrganization.billingAccount is a *required* to-one
    // relation, so its relation-select args cannot carry a `where` (only an
    // optional to-one relation's can, per the "direct" case above) — the
    // generated Prisma client rejects one with PrismaClientValidationError
    // before ever opening a connection. The isDeleted checks live in this
    // query's own root `where` instead, as relation filters.
    expect(prisma.billingAccountOrganization.findFirst).toHaveBeenCalledWith({
      select: {
        billingAccount: {
          select: {
            creditBalances: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              where: { billingAccountId: 'ba_1', isDeleted: false },
            },
          },
        },
      },
      where: {
        billingAccount: { isDeleted: false },
        billingAccountId: 'ba_1',
        isDeleted: false,
        organization: { isDeleted: false },
        organizationId: 'org_2',
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
  });

  it('never reaches another organization wallet when unlinked, and provisions its own instead', async () => {
    prisma.creditBalance.findFirst
      .mockResolvedValueOnce(null) // own-wallet check for the shared lookup
      .mockResolvedValueOnce(null); // findByOrganization default-wallet lookup
    prisma.organization.findFirst.mockResolvedValue({ billingAccount: null });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.creditBalance.create.mockResolvedValue({
      balance: 0,
      billingAccountId: 'ba_1',
      heldAmount: 0,
      id: 'balance_new',
      isDeleted: false,
      organizationId: 'org_2',
      version: 0,
    });

    const balance = await service.getOrCreateBalance(
      'org_2',
      undefined,
      'ba_1',
    );

    expect(balance.id).toBe('balance_new');
    expect(balance.organizationId).toBe('org_2');
    expect(prisma.creditBalance.create).toHaveBeenCalledWith({
      data: {
        balance: 0,
        billingAccountId: 'ba_1',
        heldAmount: 0,
        isDeleted: false,
        organizationId: 'org_2',
        version: 0,
      },
    });
    // Without isBillingAccountPreauthorized, the reservation-only path (path
    // 4) must never be consulted — an unlinked org gets no extra chance to
    // reach another org's wallet.
    expect(prisma.billingAccount.findFirst).not.toHaveBeenCalled();
  });

  it('isBillingAccountPreauthorized: reaches the wallet of a billing account the organization has since detached from', async () => {
    prisma.creditBalance.findFirst.mockResolvedValue(null); // own-wallet check misses
    prisma.organization.findFirst.mockResolvedValue({ billingAccount: null });
    prisma.billingAccountOrganization.findFirst.mockResolvedValue(null);
    prisma.billingAccount.findFirst.mockResolvedValue({
      creditBalances: [
        {
          balance: 100,
          billingAccountId: 'ba_1',
          heldAmount: 40,
          id: 'balance_1',
          isDeleted: false,
          organizationId: null,
          version: 3,
        },
      ],
    });

    const balance = await service.getOrCreateBalance(
      'org_2',
      undefined,
      'ba_1',
      true,
    );

    expect(balance.id).toBe('balance_1');
    expect(prisma.billingAccount.findFirst).toHaveBeenCalledWith({
      select: {
        creditBalances: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          where: { billingAccountId: 'ba_1', isDeleted: false },
        },
      },
      where: { id: 'ba_1', isDeleted: false },
    });
    expect(prisma.creditBalance.create).not.toHaveBeenCalled();
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
      prisma.creditBalance.findFirst.mockResolvedValueOnce(balance);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.organization.findFirst.mockResolvedValue({
        billingAccount: {
          creditBalances: [{ ...balance, heldAmount: 4, version: 2 }],
        },
      });

      const snapshot = await service.applyDelta('org_2', {
        billingAccountId: 'ba_1',
        heldDelta: -2,
      });

      const mutation = prisma.$executeRaw.mock.calls[0]?.[0];
      expect(mutation.values).toContain(walletOrganizationId);
      expect(mutation.values).not.toContain('org_2');
      expect(snapshot.held).toBe(4);
      expect(prisma.organization.findFirst).toHaveBeenCalledWith({
        select: {
          billingAccount: {
            select: {
              creditBalances: {
                orderBy: { createdAt: 'asc' },
                take: 1,
                where: {
                  billingAccountId: 'ba_1',
                  id: 'balance_1',
                  isDeleted: false,
                },
              },
            },
            where: { isDeleted: false },
          },
        },
        where: { id: 'org_2', isDeleted: false },
      });
    },
  );

  describe('tenant isolation guard (regression for #5161)', () => {
    it('passes the CLOUD tenant guard for the shared wallet lookup without bypassing it', async () => {
      let hatchWasOpen = true;
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        hatchWasOpen = isCrossOrgUnsafe();
        guardQuery('CreditBalance', args);
        return {
          balance: 100,
          billingAccountId: 'ba_1',
          heldAmount: 6,
          id: 'balance_1',
          isDeleted: false,
          organizationId: 'org_2',
          version: 1,
        };
      });

      await expect(
        runWithTenantContext({ organizationId: 'org_2' }, () =>
          service.getOrCreateBalance('org_2', undefined, 'ba_1'),
        ),
      ).resolves.toMatchObject({ id: 'balance_1' });
      expect(hatchWasOpen).toBe(false);
    });

    it('rejects a wallet lookup for an organization other than the request tenant', async () => {
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        guardQuery('CreditBalance', args);
        return null;
      });

      await expect(
        runWithTenantContext({ organizationId: 'org_2' }, () =>
          service.getOrCreateBalance('org_1', undefined, 'ba_1'),
        ),
      ).rejects.toThrow('Tenant isolation');
    });

    it('keeps the organization-scoped balance lookup inside the tenant guard and carries organizationId', async () => {
      let hatchWasOpen = true;
      let capturedArgs: unknown;
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        hatchWasOpen = isCrossOrgUnsafe();
        capturedArgs = args;
        guardQuery('CreditBalance', args);
        return null;
      });
      prisma.creditBalance.create.mockResolvedValue({
        balance: 0,
        billingAccountId: undefined,
        heldAmount: 0,
        id: 'balance_new',
        isDeleted: false,
        organizationId: 'org_2',
        version: 0,
      });

      await runWithTenantContext({ organizationId: 'org_2' }, () =>
        service.getOrCreateBalance('org_2'),
      );

      expect(hatchWasOpen).toBe(false);
      expect(capturedArgs).toEqual({
        where: { isDeleted: false, organizationId: 'org_2' },
      });
    });

    it('passes the tenant guard on the post-mutation re-read when the shared wallet has no owning organization', async () => {
      const wallet = {
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 20,
        id: 'balance_1',
        isDeleted: false,
        organizationId: null,
        version: 1,
      };
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        guardQuery('CreditBalance', args);
        return prisma.creditBalance.findFirst.mock.calls.length === 1
          ? wallet
          : null;
      });
      prisma.organization.findFirst.mockResolvedValue({ billingAccount: null });
      prisma.billingAccountOrganization.findFirst.mockImplementation(
        async (args) => {
          guardQuery('BillingAccountOrganization', args);
          return {
            billingAccount: {
              creditBalances: [{ ...wallet, heldAmount: 8, version: 2 }],
            },
          };
        },
      );
      prisma.$executeRaw.mockResolvedValue(1);

      await expect(
        runWithTenantContext({ organizationId: 'org_2' }, () =>
          service.applyDelta('org_2', {
            billingAccountId: 'ba_1',
            heldDelta: -12,
          }),
        ),
      ).resolves.toMatchObject({ held: 8 });
      expect(isCrossOrgUnsafe()).toBe(false);
    });
  });
});
