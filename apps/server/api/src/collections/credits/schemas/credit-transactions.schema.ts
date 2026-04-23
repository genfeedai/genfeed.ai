import { CreditTransactionCategory } from '@genfeedai/enums';
import type { CreditTransaction as PrismaCreditTransaction } from '@genfeedai/prisma';

export type { CreditTransaction as CreditTransactions } from '@genfeedai/prisma';

export interface CreditTransactionsDocument
  extends Omit<PrismaCreditTransaction, 'metadata'> {
  _id: string;
  balanceBefore?: number | null;
  category?: CreditTransactionCategory;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  organization?: string;
  [key: string]: unknown;
}
