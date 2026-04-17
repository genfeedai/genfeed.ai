import { CreditTransactions } from '@api/collections/credits/schemas/credit-transactions.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { CreditTransactionCategory } from '@genfeedai/enums';

export class CreditTransactionsEntity
  extends BaseEntity
  implements CreditTransactions
{
  declare readonly organization: string;
  declare readonly category: CreditTransactionCategory;
  declare readonly amount: number;
  declare readonly balanceBefore: number;
  declare readonly balanceAfter: number;
  declare readonly source?: string;
  declare readonly description?: string;
  declare readonly expiresAt?: Date;
}
