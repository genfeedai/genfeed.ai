import {
  getActionOriginContext,
  runWithActionOrigin,
} from '@api/action-origin/action-origin.context';
import {
  type RecordingClient,
  recordActivityInTransaction,
} from '@api/services/activity-recording/activity-recording.core';
import {
  CreditTransactionCategory,
  getCreditActivityKey,
} from '@genfeedai/contracts';
import type { CreditTransaction, Prisma } from '@genfeedai/prisma';

export type CreditActivityClient = RecordingClient &
  Pick<Prisma.TransactionClient, 'brand'>;

/**
 * Persist alongside the ledger so rollback and replay cannot create false
 * charges. Recorded through the recording API inside the ledger transaction;
 * credit history keys raise no alert, so there is no post-commit effect.
 */
export async function recordCreditTransactionActivity(
  tx: CreditActivityClient,
  transaction: CreditTransaction,
): Promise<void> {
  const key = getCreditActivityKey(transaction.category);
  if (
    !key ||
    (transaction.amount === 0 &&
      transaction.category !== CreditTransactionCategory.RESET &&
      transaction.category !== CreditTransactionCategory.BYOK_USAGE)
  )
    return;

  const metadata =
    transaction.metadata !== null &&
    typeof transaction.metadata === 'object' &&
    !Array.isArray(transaction.metadata)
      ? transaction.metadata
      : {};
  const candidateBrandId =
    typeof metadata.brandId === 'string' ? metadata.brandId : undefined;
  const brand = candidateBrandId
    ? await tx.brand.findFirst({
        select: { id: true },
        where: {
          id: candidateBrandId,
          organizationId: transaction.organizationId,
          isDeleted: false,
        },
      })
    : null;
  const context = getActionOriginContext();
  const actorUserId = transaction.actorUserId ?? context.actorUserId;
  await runWithActionOrigin(
    { ...context, ...(actorUserId ? { actorUserId } : {}) },
    () =>
      recordActivityInTransaction(tx, {
        brandId: brand?.id ?? null,
        entityId: transaction.id,
        entityModel: 'CreditTransaction',
        id: `credit-transaction:${transaction.id}`,
        isRead: false,
        key,
        organizationId: transaction.organizationId,
        source: transaction.source ?? 'system',
        userId: actorUserId ?? null,
        value: JSON.stringify({
          category: transaction.category,
          description: transaction.description,
          transactionId: transaction.id,
          value:
            transaction.category === CreditTransactionCategory.BYOK_USAGE
              ? 0
              : transaction.amount,
        }),
      }),
  );
}
