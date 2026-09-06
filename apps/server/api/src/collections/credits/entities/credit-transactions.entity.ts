import { BaseEntity } from '@api/entities/base.entity';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import { type CreditTransaction as CreditTransactions } from '@genfeedai/prisma';

export class CreditTransactionsEntity
  extends BaseEntity
  implements CreditTransactions
{
  declare readonly id: string;
  declare readonly workflowExecutionId: string | null;
  declare readonly workflowNodeId: string | null;
  declare readonly workflowOperationId: string | null;
  declare readonly organizationId: string;
  declare readonly billingAccountId: string | null;
  declare readonly actorUserId: string | null;
  declare readonly reservationId: string | null;
  declare readonly idempotencyKey: string | null;
  declare readonly metadata: CreditTransactions['metadata'];
  declare readonly referenceId: CreditTransactions['referenceId'];
  declare readonly referenceType: CreditTransactions['referenceType'];
  declare readonly category: CreditTransactionCategory;
  declare readonly amount: number;
  declare readonly balanceBefore: number;
  declare readonly balanceAfter: number;
  declare readonly source: CreditTransactions['source'];
  declare readonly description: CreditTransactions['description'];
  declare readonly expiresAt?: Date;
}
