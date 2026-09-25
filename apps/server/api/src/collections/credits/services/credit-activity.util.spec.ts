import { recordCreditTransactionActivity } from '@api/collections/credits/services/credit-activity.util';
import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey, CreditTransactionCategory } from '@genfeedai/contracts';
import type { CreditTransaction } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function transaction(
  overrides: Partial<CreditTransaction> = {},
): CreditTransaction {
  return {
    id: 'ledger-1',
    organizationId: 'org-1',
    category: 'deduct',
    amount: 1,
    description: 'AI brand profile generation',
    source: 'system',
    actorUserId: 'user-1',
    metadata: null,
    ...overrides,
  } as CreditTransaction;
}

function client() {
  return {
    activity: { create: vi.fn().mockResolvedValue({}) },
    brand: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('credit activity persistence', () => {
  it.each(Object.values(CreditTransactionCategory))(
    'records %s with its ledger reason and correct amount',
    async (category) => {
      const tx = client();
      await recordCreditTransactionActivity(
        tx as unknown as PrismaTransactionClient,
        transaction({ category }),
      );
      expect(tx.activity.create).toHaveBeenCalledOnce();
      const data = tx.activity.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        id: 'credit-transaction:ledger-1',
        entityId: 'ledger-1',
        entityModel: 'CreditTransaction',
        organizationId: 'org-1',
        brandId: null,
        userId: 'user-1',
      });
      expect(JSON.parse(data.data.value)).toEqual({
        category,
        description: 'AI brand profile generation',
        transactionId: 'ledger-1',
        value: category === 'byok-usage' ? 0 : 1,
      });
    },
  );

  it('validates brand ownership and keeps unknown attribution organization-wide', async () => {
    const tx = client();
    await recordCreditTransactionActivity(
      tx as unknown as PrismaTransactionClient,
      transaction({ metadata: { brandId: 'other-tenant-brand' } }),
    );
    expect(tx.brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: 'other-tenant-brand',
        organizationId: 'org-1',
        isDeleted: false,
      },
    });
    expect(tx.activity.create.mock.calls[0][0].data.brandId).toBeNull();
    tx.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    await recordCreditTransactionActivity(
      tx as unknown as PrismaTransactionClient,
      transaction({ metadata: { brandId: 'brand-1' } }),
    );
    expect(tx.activity.create.mock.calls[1][0].data.brandId).toBe('brand-1');
  });

  it('does not invent usage for a free settlement or an unknown category', async () => {
    const tx = client();
    await recordCreditTransactionActivity(
      tx as unknown as PrismaTransactionClient,
      transaction({ amount: 0 }),
    );
    await recordCreditTransactionActivity(
      tx as unknown as PrismaTransactionClient,
      transaction({ category: 'unknown' }),
    );
    expect(tx.activity.create).not.toHaveBeenCalled();
    await recordCreditTransactionActivity(
      tx as unknown as PrismaTransactionClient,
      transaction({ category: 'reset', amount: 0 }),
    );
    expect(tx.activity.create.mock.calls[0][0].data.action).toBe(
      ActivityKey.CREDITS_RESET,
    );
  });

  it('uses the caller transaction and propagates activity failure to roll back the ledger', async () => {
    const tx = {
      ...client(),
      creditTransaction: { create: vi.fn().mockResolvedValue(transaction()) },
    };
    const prisma = { $transaction: vi.fn() };
    const service = new CreditTransactionsService(
      prisma as unknown as PrismaService,
      { error: vi.fn() } as unknown as LoggerService,
      {} as CreditBalanceService,
      { invalidate: vi.fn() } as unknown as CacheInvalidationService,
    );
    tx.activity.create.mockRejectedValue(new Error('activity write failed'));
    await expect(
      service.createTransactionEntry(
        'org-1',
        CreditTransactionCategory.DEDUCT,
        1,
        25,
        24,
        'system',
        'AI brand profile generation',
        undefined,
        tx as unknown as PrismaTransactionClient,
      ),
    ).rejects.toThrow('activity write failed');
    expect(tx.creditTransaction.create).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('wraps standalone writes atomically and skips an idempotent own-key replay', async () => {
    const tx = {
      ...client(),
      creditTransaction: {
        create: vi
          .fn()
          .mockResolvedValue(transaction({ category: 'byok-usage' })),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new CreditTransactionsService(
      prisma as unknown as PrismaService,
      { error: vi.fn() } as unknown as LoggerService,
      {} as CreditBalanceService,
      { invalidate: vi.fn() } as unknown as CacheInvalidationService,
    );
    await service.createTransactionEntry(
      'org-1',
      CreditTransactionCategory.BYOK_USAGE,
      1,
      25,
      25,
      'image-generate',
      'Image generation',
      undefined,
      undefined,
      { idempotencyKey: 'byok-key' },
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.activity.create).toHaveBeenCalledOnce();
    tx.creditTransaction.findFirst.mockResolvedValue(
      transaction({ category: 'byok-usage' }),
    );
    await service.createTransactionEntry(
      'org-1',
      CreditTransactionCategory.BYOK_USAGE,
      1,
      25,
      25,
      'image-generate',
      'Image generation',
      undefined,
      undefined,
      { idempotencyKey: 'byok-key' },
    );
    expect(tx.activity.create).toHaveBeenCalledOnce();
  });
});
