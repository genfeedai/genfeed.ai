import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

it('acknowledges a concurrent BYOK replay after the unique key wins elsewhere', async () => {
  const row = {
    id: 'existing',
    organizationId: 'org',
    category: 'byok-usage',
    amount: 3,
    balanceAfter: 10,
  };
  const prisma = {
    creditTransaction: {
      findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(row),
      create: vi.fn().mockRejectedValue({ code: 'P2002' }),
    },
  };
  const database = {
    ...prisma,
    $transaction: vi.fn(
      async (callback: (client: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    ),
  };
  const service = new CreditTransactionsService(
    database as unknown as PrismaService,
    { error: vi.fn() } as unknown as LoggerService,
    {} as CreditBalanceService,
    { invalidate: vi.fn() } as unknown as CacheInvalidationService,
  );
  const result = await service.createTransactionEntry(
    'org',
    CreditTransactionCategory.BYOK_USAGE,
    3,
    10,
    10,
    'source',
    'usage',
    undefined,
    undefined,
    { idempotencyKey: 'byok:org:job' },
  );
  expect(result.id).toBe('existing');
  expect(prisma.creditTransaction.findFirst).toHaveBeenLastCalledWith({
    where: {
      organizationId: 'org',
      isDeleted: false,
      idempotencyKey: 'byok:org:job',
      category: 'byok-usage',
    },
  });
});

function ledgerClient() {
  return {
    activity: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    brand: { findFirst: vi.fn().mockResolvedValue(null) },
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ledger-1',
        ...data,
      })),
    },
  };
}

function buildService(prisma: unknown, balance = { balance: 100 }) {
  return new CreditTransactionsService(
    prisma as PrismaService,
    { debug: vi.fn(), error: vi.fn() } as unknown as LoggerService,
    {
      getOrCreateBalance: vi.fn().mockResolvedValue(balance),
    } as unknown as CreditBalanceService,
    { invalidate: vi.fn() } as unknown as CacheInvalidationService,
  );
}

describe('ledger brand attribution', () => {
  it('persists the brand on the ledger row', async () => {
    const tx = ledgerClient();
    await buildService({}).createTransactionEntry(
      'org',
      CreditTransactionCategory.DEDUCT,
      5,
      100,
      95,
      'image-generation',
      'Image',
      undefined,
      tx as never,
      { brandId: 'brand-1' },
    );

    expect(tx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        category: 'deduct',
        organizationId: 'org',
      }),
    });
  });

  it('writes no brand for org-level spend', async () => {
    const tx = ledgerClient();
    await buildService({}).createTransactionEntry(
      'org',
      CreditTransactionCategory.DEDUCT,
      5,
      100,
      95,
      'script',
      'Org level',
      undefined,
      tx as never,
      { brandId: null },
    );

    const [{ data }] = tx.creditTransaction.create.mock.calls[0];
    expect(data).not.toHaveProperty('brandId');
  });

  it('nets refunds against deductions in usage and excludes referral reversals', async () => {
    const now = new Date();
    const findMany = vi.fn().mockResolvedValue([
      { amount: 10, category: 'deduct', createdAt: now, source: 'image' },
      { amount: 4, category: 'refund', createdAt: now, source: 'image' },
    ]);
    const service = buildService({ creditTransaction: { findMany } });

    const metrics = await service.getUsageMetrics('org');

    expect(metrics.usage7Days).toBe(6);
    expect(metrics.usage30Days).toBe(6);
    expect(metrics.breakdown).toEqual([
      { amount: 6, count: 2, source: 'image' },
    ]);
    const [{ where }] = findMany.mock.calls[0];
    expect(where.category).toEqual({ in: ['deduct', 'refund'] });
    expect(where.OR).toEqual([
      { referenceType: null },
      { referenceType: { not: 'referral-reward-reversal' } },
    ]);
  });

  it('matches a brand filter on the column or legacy metadata', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = buildService({ creditTransaction: { findMany } });

    await service.getOrganizationTransactions('org', 10, 0, {
      brandId: 'brand-1',
    });

    const [{ where }] = findMany.mock.calls[0];
    expect(where.OR).toEqual([
      { brandId: 'brand-1' },
      { metadata: { equals: 'brand-1', path: ['brandId'] } },
    ]);
  });
});
