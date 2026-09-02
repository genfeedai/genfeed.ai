import { CreditTransactionCategory } from '@genfeedai/contracts';
import type { CreditTransaction as PrismaCreditTransaction } from '@genfeedai/prisma';

export type { CreditTransaction as CreditTransactions } from '@genfeedai/prisma';

export interface CreditTransactionsDocument
  extends Omit<PrismaCreditTransaction, 'metadata' | 'category'> {
  balanceBefore?: number | null;
  category?: CreditTransactionCategory;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
