import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CreditTransactionsService.getLatestPaidGrantCredits', () => {
  const creditTransactionFindFirst = vi.fn();
  const organizationFindFirst = vi.fn();
  const billingAccountFindFirst = vi.fn();
  const linkFindMany = vi.fn();
  const prisma = {
    billingAccount: { findFirst: billingAccountFindFirst },
    billingAccountOrganization: { findMany: linkFindMany },
    creditTransaction: { findFirst: creditTransactionFindFirst },
    organization: { findFirst: organizationFindFirst },
  };

  function buildService(): CreditTransactionsService {
    return new CreditTransactionsService(
      prisma as unknown as PrismaService,
      { debug: vi.fn(), error: vi.fn() } as unknown as LoggerService,
      {} as CreditBalanceService,
      { invalidate: vi.fn() } as unknown as CacheInvalidationService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    creditTransactionFindFirst.mockResolvedValue({ amount: 10_000 });
    linkFindMany.mockResolvedValue([]);
  });

  it('counts paid grants recorded on the shared billing account', async () => {
    organizationFindFirst.mockResolvedValue({ billingAccountId: 'ba_1' });
    billingAccountFindFirst.mockResolvedValue({ id: 'ba_1', isDeleted: false });

    await expect(
      buildService().getLatestPaidGrantCredits('org_b'),
    ).resolves.toBe(10_000);

    const where = creditTransactionFindFirst.mock.calls[0][0].where;
    expect(where.AND[1]).toEqual({
      OR: [
        { isDeleted: false, organizationId: 'org_b' },
        { billingAccountId: 'ba_1', isDeleted: false },
      ],
    });
    expect(where.AND[0].category).toEqual({ in: ['add', 'reset'] });
  });

  it("falls back to the organization's own grants without a billing account", async () => {
    organizationFindFirst.mockResolvedValue({ billingAccountId: null });

    await buildService().getLatestPaidGrantCredits('org_a');

    expect(creditTransactionFindFirst.mock.calls[0][0].where.AND[1]).toEqual({
      OR: [{ isDeleted: false, organizationId: 'org_a' }],
    });
  });

  it('returns null when nothing was ever paid', async () => {
    organizationFindFirst.mockResolvedValue({ billingAccountId: null });
    creditTransactionFindFirst.mockResolvedValue(null);

    await expect(
      buildService().getLatestPaidGrantCredits('org_a'),
    ).resolves.toBeNull();
  });
});
