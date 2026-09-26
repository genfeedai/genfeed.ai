import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

const walletAccessWhere = (organizationId: string) => ({
  OR: [
    { organizationId },
    {
      billingAccount: {
        isDeleted: false,
        OR: [
          { organizations: { some: { id: organizationId, isDeleted: false } } },
          {
            organizationLinks: {
              some: {
                isDeleted: false,
                organizationId,
                status: BillingAccountOrganizationStatus.LINKED,
              },
            },
          },
        ],
      },
    },
  ],
});

const guardCreditBalance = (args: unknown) =>
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model: 'CreditBalance',
    operation: 'findFirst',
    tenantModelNames: new Set(['CreditBalance']),
  });

describe('CreditBalanceService', () => {
  const prisma = {
    $executeRaw: vi.fn(),
    creditBalance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new CreditBalanceService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a shared billing-account wallet only through an active link to the requesting organization', async () => {
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
        ...walletAccessWhere('org_2'),
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
          ...walletAccessWhere('org_2'),
          id: 'balance_1',
          isDeleted: false,
        },
      });
    },
  );

  describe('tenant isolation guard (regression for #5161)', () => {
    it('passes the CLOUD tenant guard for the shared wallet lookup without bypassing it', async () => {
      let hatchWasOpen = true;
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        hatchWasOpen = isCrossOrgUnsafe();
        guardCreditBalance(args);
        return {
          balance: 100,
          billingAccountId: 'ba_1',
          heldAmount: 6,
          id: 'balance_1',
          isDeleted: false,
          organizationId: 'org_1',
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
        guardCreditBalance(args);
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
        guardCreditBalance(args);
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
        guardCreditBalance(args);
        return prisma.creditBalance.findFirst.mock.calls.length === 1
          ? wallet
          : { ...wallet, heldAmount: 8, version: 2 };
      });
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
