import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { type CreditTransaction as CreditTransactions } from '@genfeedai/prisma';

export class CreditTransactionsEntity
  extends BaseEntity
  implements CreditTransactions
{
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly organizationId: string;
  declare readonly metadata: CreditTransactions['metadata'];
  declare readonly referenceId: CreditTransactions['referenceId'];
  declare readonly referenceType: CreditTransactions['referenceType'];
  declare readonly organization: string;
  declare readonly category: CreditTransactionCategory;
  declare readonly amount: number;
  declare readonly balanceBefore: number;
  declare readonly balanceAfter: number;
  declare readonly source: CreditTransactions['source'];
  declare readonly description: CreditTransactions['description'];
  declare readonly expiresAt?: Date;
}
