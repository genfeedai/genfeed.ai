import type { BatchItemFull } from '@api/services/batch-generation/batch-generation.types';
import { BatchItemStatus, toPersistedReviewDecision } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';

export type BatchItemRowWriter = {
  batchItem: Pick<Prisma.TransactionClient['batchItem'], 'upsert'>;
};

const BATCH_ITEM_STATUSES = new Set<string>(Object.values(BatchItemStatus));

export function toPrismaBatchItemStatus(
  status: string | undefined,
): BatchItemStatus {
  const normalized = (status ?? '').toUpperCase();
  if (BATCH_ITEM_STATUSES.has(normalized)) {
    return normalized as BatchItemStatus;
  }
  return BatchItemStatus.PENDING;
}

export function toBatchItemCreatedAt(
  createdAt: string | undefined,
  fallback: Date,
): Date {
  if (!createdAt) {
    return fallback;
  }

  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Dual-write the JSON `Batch.items` payload onto typed `batch_items` rows so
 * review/status scans can groupBy + paginate without loading every batch blob.
 */
export async function persistBatchItemRows(
  prisma: BatchItemRowWriter,
  input: {
    batchId: string;
    brandId?: string | null;
    items: BatchItemFull[];
    organizationId: string;
  },
): Promise<void> {
  const now = new Date();

  await Promise.all(
    input.items.map((item) => {
      const createdAt = toBatchItemCreatedAt(item.createdAt, now);
      const data = item as unknown as Prisma.InputJsonValue;
      const reviewDecision = toPersistedReviewDecision(item.reviewDecision);
      const status = toPrismaBatchItemStatus(item.status);
      const row = {
        batchId: input.batchId,
        brandId: input.brandId ?? null,
        createdAt,
        data,
        isDeleted: false,
        organizationId: input.organizationId,
        reviewDecision,
        status,
      };

      // tenant-scope-ignore: organizationId is pinned; isDeleted is omitted so unique upsert restores tombstones
      return prisma.batchItem.upsert({
        create: {
          ...row,
          id: item.id,
        },
        update: {
          brandId: row.brandId,
          data: row.data,
          isDeleted: false,
          reviewDecision,
          status,
        },
        // Unique selector must omit isDeleted so a tombstone can match and restore.
        where: {
          id: item.id,
          organizationId: input.organizationId,
        },
      });
    }),
  );
}
