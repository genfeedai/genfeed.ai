import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

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

  describe('tenant isolation guard (regression for #5161)', () => {
    it('keeps the shared billing-account wallet lookup inside the crossOrgUnsafe hatch', async () => {
      let hatchWasOpen = false;
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        hatchWasOpen = isCrossOrgUnsafe();
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'CreditBalance',
          operation: 'findFirst',
          tenantModelNames: new Set(['CreditBalance']),
        });
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
      expect(hatchWasOpen).toBe(true);
    });

    it('keeps the organization-scoped balance lookup inside the tenant guard and carries organizationId', async () => {
      let hatchWasOpen = true;
      let capturedArgs: unknown;
      prisma.creditBalance.findFirst.mockImplementation(async (args) => {
        hatchWasOpen = isCrossOrgUnsafe();
        capturedArgs = args;
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'CreditBalance',
          operation: 'findFirst',
          tenantModelNames: new Set(['CreditBalance']),
        });
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

    it('keeps the post-mutation re-read inside the tenant guard when the shared wallet has no owning organization', async () => {
      prisma.creditBalance.findFirst
        .mockResolvedValueOnce({
          balance: 100,
          billingAccountId: 'ba_1',
          heldAmount: 20,
          id: 'balance_1',
          isDeleted: false,
          organizationId: null,
          version: 1,
        })
        .mockImplementationOnce(async (args) => {
          assertTenantScopedQuery({
            args,
            isCloud: true,
            model: 'CreditBalance',
            operation: 'findFirst',
            tenantModelNames: new Set(['CreditBalance']),
          });
          return {
            balance: 100,
            billingAccountId: 'ba_1',
            heldAmount: 8,
            id: 'balance_1',
            isDeleted: false,
            organizationId: null,
            version: 2,
          };
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
    });
  });
});
