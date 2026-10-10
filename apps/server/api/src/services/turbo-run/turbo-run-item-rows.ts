import { scopedWhere } from '@api/index';
import { BATCH_ITEM_UPSERT_CHUNK_SIZE } from '@api/services/turbo-run/turbo-run.constants';
import type { TurboRunItemFull } from '@api/services/turbo-run/turbo-run.types';
import {
  TurboRunItemStatus,
  toPersistedReviewDecision,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';

export type TurboRunItemRowWriter = {
  turboRunItem: Pick<Prisma.TransactionClient['turboRunItem'], 'upsert'>;
};

export type TurboRunJsonAndRowWriter = TurboRunItemRowWriter & {
  turboRun: Pick<Prisma.TransactionClient['turboRun'], 'updateMany'>;
};

export type WriteTurboRunJsonAndItemRowsInput = {
  turboRunId: string;
  brandId?: string | null;
  extraTurboRunData?: Omit<Prisma.TurboRunUpdateManyMutationInput, 'items'>;
  items: TurboRunItemFull[];
  organizationId: string;
  whereExtra?: Record<string, unknown>;
};

const TURBO_RUN_ITEM_STATUSES = new Set<string>(Object.values(TurboRunItemStatus));

export function toPrismaTurboRunItemStatus(
  status: string | undefined,
): TurboRunItemStatus {
  const normalized = (status ?? '').toUpperCase();
  if (TURBO_RUN_ITEM_STATUSES.has(normalized)) {
    return normalized as TurboRunItemStatus;
  }
  return TurboRunItemStatus.PENDING;
}

export function toTurboRunItemCreatedAt(
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
 * Include/select args so readers can prefer typed `turbo_run_items` rows.
 * `Batch.items` JSON stays as the fallback until a later PR drops it.
 */
export function turboRunItemRowsReadArgs(organizationId: string) {
  return {
    orderBy: { createdAt: 'asc' as const },
    select: { assigneeId: true, data: true, isDeleted: true },
    where: { isDeleted: false, organizationId },
  };
}

export function turboRunItemRowsInclude(organizationId: string) {
  return { turboRunItems: turboRunItemRowsReadArgs(organizationId) };
}

export async function withTurboRunWriteTransaction<TClient, T>(
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
 * Dual-write the JSON `Batch.items` payload onto typed `turbo_run_items` rows so
 * review/status scans can groupBy + paginate without loading every batch blob.
 *
 * Upserts run in bounded chunks. Tombstone restore still needs per-row upsert
 * (`isDeleted` omitted from the unique where), so this is not createMany
 * skipDuplicates.
 */
export async function persistTurboRunItemRows(
  prisma: TurboRunItemRowWriter,
  input: {
    turboRunId: string;
    brandId?: string | null;
    items: TurboRunItemFull[];
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
      chunk.map((item) => persistOneTurboRunItemRow(prisma, input, item, now)),
    );
  }
}

/**
 * One transactional writer for the JSON blob + typed rows. Keep writing
 * `Batch.items` here until the reader ratchet is the only consumer and a
 * follow-up PR drops the column.
 */
export async function writeTurboRunJsonAndItemRows(
  prisma: TurboRunJsonAndRowWriter,
  input: WriteTurboRunJsonAndItemRowsInput,
): Promise<{ count: number }> {
  return withTurboRunWriteTransaction(prisma, async (tx) => {
    const result = await tx.turboRun.updateMany({
      data: {
        ...input.extraTurboRunData,
        items: toPrismaJson(input.items),
      },
      where: scopedWhere(input.organizationId, {
        id: input.turboRunId,
        ...input.whereExtra,
      }),
    });
    if (result.count === 1) {
      await persistTurboRunItemRows(tx, {
        turboRunId: input.turboRunId,
        brandId: input.brandId,
        items: input.items,
        organizationId: input.organizationId,
      });
    }
    return result;
  });
}

function persistOneTurboRunItemRow(
  prisma: TurboRunItemRowWriter,
  input: {
    turboRunId: string;
    brandId?: string | null;
    organizationId: string;
  },
  item: TurboRunItemFull,
  now: Date,
): Promise<unknown> {
  const createdAt = toTurboRunItemCreatedAt(item.createdAt, now);
  const data = toPersistedTurboRunItemData(item);
  const reviewDecision = toPersistedReviewDecision(item.reviewDecision);
  const status = toPrismaTurboRunItemStatus(item.status);
  const assigneeId = item.assigneeId ?? null;
  const row = {
    assigneeId,
    turboRunId: input.turboRunId,
    brandId: input.brandId ?? null,
    createdAt,
    data,
    isDeleted: false,
    organizationId: input.organizationId,
    reviewDecision,
    status,
  };

  // tenant-scope-ignore: organizationId is pinned; isDeleted is omitted so unique upsert restores tombstones
  return prisma.turboRunItem.upsert({
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

function toPersistedTurboRunItemData(item: TurboRunItemFull): Prisma.InputJsonValue {
  const { assignee: _assignee, ...rest } = item as TurboRunItemFull & {
    assignee?: unknown;
  };
  return toPrismaJson(rest);
}
