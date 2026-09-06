import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { expect, it, vi } from 'vitest';

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
  const service = new CreditTransactionsService(
    prisma as unknown as PrismaService,
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
