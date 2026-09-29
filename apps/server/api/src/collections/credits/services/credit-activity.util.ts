import {
  getActionOriginContext,
  runWithActionOrigin,
} from '@api/action-origin/action-origin.context';
import {
  type RecordingClient,
  recordActivityInTransaction,
} from '@api/services/activity-recording/activity-recording.core';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ActivityEntityModel,
  CreditTransactionCategory,
  getCreditActivityKey,
} from '@genfeedai/contracts';
import type { CreditTransaction, Prisma } from '@genfeedai/prisma';

export type CreditActivityClient = RecordingClient &
  Pick<Prisma.TransactionClient, 'brand'>;

const GENERATION_REFERENCE_TYPES: readonly string[] = [
  'agent-media:generation',
  'agent-media:voice-generation',
];

function readGeneratedAssetId(transaction: CreditTransaction): string | null {
  const metadata =
    transaction.metadata !== null &&
    typeof transaction.metadata === 'object' &&
    !Array.isArray(transaction.metadata)
      ? transaction.metadata
      : {};
  if (typeof metadata.assetId === 'string' && metadata.assetId.trim()) {
    return metadata.assetId.trim();
  }
  return transaction.referenceId &&
    transaction.referenceType &&
    GENERATION_REFERENCE_TYPES.includes(transaction.referenceType)
    ? transaction.referenceId
    : null;
}

/**
 * Show what a generation cost on its own activity row. Runs inside the ledger
 * transaction so the amount rolls back with the charge; a missing or non-JSON
 * generation activity is left untouched.
 */
async function recordGenerationCreditsOnActivity(
  tx: CreditActivityClient,
  transaction: CreditTransaction,
): Promise<void> {
  if (
    transaction.category !== CreditTransactionCategory.DEDUCT ||
    transaction.amount <= 0
  ) {
    return;
  }
  const assetId = readGeneratedAssetId(transaction);
  if (!assetId) return;

  const activity = await tx.activity.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      entityId: assetId,
      entityModel: ActivityEntityModel.INGREDIENT,
      isDeleted: false,
      organizationId: transaction.organizationId,
    },
  });
  const data =
    activity?.data !== null &&
    typeof activity?.data === 'object' &&
    !Array.isArray(activity?.data)
      ? (activity.data as Record<string, unknown>)
      : null;
  if (!activity || !data || typeof data.value !== 'string') return;

  let value: unknown;
  try {
    value = JSON.parse(data.value);
  } catch {
    return;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  await tx.activity.update({
    data: {
      data: {
        ...data,
        value: JSON.stringify({ ...value, credits: transaction.amount }),
      } as Prisma.InputJsonObject,
    },
    where: scopedWhere(transaction.organizationId, { id: activity.id }),
  });
}

/**
 * Persist alongside the ledger so rollback and replay cannot create false
 * charges. Recorded through the recording API inside the ledger transaction;
 * credit history keys raise no alert, so there is no post-commit effect.
 */
export async function recordCreditTransactionActivity(
  tx: CreditActivityClient,
  transaction: CreditTransaction,
): Promise<void> {
  await recordGenerationCreditsOnActivity(tx, transaction);
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
