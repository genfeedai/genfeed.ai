import { scopedWhere } from '@api/index';
import { BATCH_ITEM_UPSERT_CHUNK_SIZE } from '@api/services/batch-generation/batch-generation.constants';
import type { BatchItemFull } from '@api/services/batch-generation/batch-generation.types';
import {
  BatchItemStatus,
  toPersistedReviewDecision,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

export type BatchItemRowWriter = {
  batchItem: Pick<Prisma.TransactionClient['batchItem'], 'upsert'>;
};

export type BatchJsonAndRowWriter = BatchItemRowWriter & {
  batch: Pick<Prisma.TransactionClient['batch'], 'updateMany'>;
};

export type WriteBatchJsonAndItemRowsInput = {
  batchId: string;
  brandId?: string | null;
  extraBatchData?: Omit<Prisma.BatchUpdateManyMutationInput, 'items'>;
  items: BatchItemFull[];
  organizationId: string;
  whereExtra?: Record<string, unknown>;
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
 * Include/select args so readers can prefer typed `batch_items` rows.
 * `Batch.items` JSON stays as the fallback until a later PR drops it.
 */
export function batchItemRowsReadArgs(organizationId: string) {
  return {
    orderBy: { createdAt: 'asc' as const },
    select: { assigneeId: true, data: true, isDeleted: true },
    where: { isDeleted: false, organizationId },
  };
}

export function batchItemRowsInclude(organizationId: string) {
  return { batchItems: batchItemRowsReadArgs(organizationId) };
}

export async function withBatchWriteTransaction<TClient, T>(
  prisma: TClient,
  fn: (tx: TClient) => Promise<T>,
): Promise<T> {
  const host = prisma as TClient & {
    $transaction?: (fn: (tx: TClient) => Promise<unknown>) => Promise<unknown>;
  };
  if (typeof host.$transaction === 'function') {
    return (await host.$transaction((tx) => fn(tx))) as T;
  }
  return fn(prisma);
}

/**
 * Dual-write the JSON `Batch.items` payload onto typed `batch_items` rows so
 * review/status scans can groupBy + paginate without loading every batch blob.
 *
 * Upserts run in bounded chunks. Tombstone restore still needs per-row upsert
 * (`isDeleted` omitted from the unique where), so this is not createMany
 * skipDuplicates.
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

  for (
    let index = 0;
    index < input.items.length;
    index += BATCH_ITEM_UPSERT_CHUNK_SIZE
  ) {
    const chunk = input.items.slice(
      index,
      index + BATCH_ITEM_UPSERT_CHUNK_SIZE,
    );
    await Promise.all(
      chunk.map((item) => persistOneBatchItemRow(prisma, input, item, now)),
    );
  }
}

/**
 * One transactional writer for the JSON blob + typed rows. Keep writing
 * `Batch.items` here until the reader ratchet is the only consumer and a
 * follow-up PR drops the column.
 */
export async function writeBatchJsonAndItemRows(
  prisma: BatchJsonAndRowWriter,
  input: WriteBatchJsonAndItemRowsInput,
): Promise<{ count: number }> {
  return withBatchWriteTransaction(prisma, async (tx) => {
    const result = await tx.batch.updateMany({
      data: {
        ...input.extraBatchData,
        items: input.items as unknown as Prisma.InputJsonValue,
      },
      where: scopedWhere(input.organizationId, {
        id: input.batchId,
        ...input.whereExtra,
      }),
    });
    if (result.count === 1) {
      await persistBatchItemRows(tx, {
        batchId: input.batchId,
        brandId: input.brandId,
        items: input.items,
        organizationId: input.organizationId,
      });
    }
    return result;
  });
}

function persistOneBatchItemRow(
  prisma: BatchItemRowWriter,
  input: {
    batchId: string;
    brandId?: string | null;
    organizationId: string;
  },
  item: BatchItemFull,
  now: Date,
): Promise<unknown> {
  const createdAt = toBatchItemCreatedAt(item.createdAt, now);
  const data = toPersistedBatchItemData(item);
  const reviewDecision = toPersistedReviewDecision(item.reviewDecision);
  const status = toPrismaBatchItemStatus(item.status);
  const assigneeId = item.assigneeId ?? null;
  const row = {
    assigneeId,
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
      assigneeId,
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
}

function toPersistedBatchItemData(item: BatchItemFull): Prisma.InputJsonValue {
  const { assignee: _assignee, ...rest } = item as BatchItemFull & {
    assignee?: unknown;
  };
  return rest as unknown as Prisma.InputJsonValue;
}
