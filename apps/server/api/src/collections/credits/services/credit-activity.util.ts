import {
  getActionOriginContext,
  withActionOriginMetadata,
} from '@api/action-origin/action-origin.context';
import {
  CreditTransactionCategory,
  getCreditActivityKey,
} from '@genfeedai/contracts';
import {
  type CreditTransaction,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';

/** Persist alongside the ledger so rollback and replay cannot create false charges. */
export async function recordCreditTransactionActivity(
  tx: Pick<Prisma.TransactionClient, 'activity' | 'brand'>,
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
  await tx.activity.create({
    data: {
      id: `credit-transaction:${transaction.id}`,
      organizationId: transaction.organizationId,
      brandId: brand?.id ?? null,
      userId: actorUserId ?? null,
      entityId: transaction.id,
      entityModel: 'CreditTransaction',
      action: key,
      data: toPrismaJson(
        withActionOriginMetadata(
          {
            key,
            isRead: false,
            source: transaction.source ?? 'system',
            value: JSON.stringify({
              category: transaction.category,
              description: transaction.description,
              transactionId: transaction.id,
              value:
                transaction.category === CreditTransactionCategory.BYOK_USAGE
                  ? 0
                  : transaction.amount,
            }),
          },
          { ...context, ...(actorUserId ? { actorUserId } : {}) },
        ),
      ),
    },
  });
}
