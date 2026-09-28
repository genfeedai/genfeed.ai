import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import {
  type BatchWithConfig,
  resolveBatchItems,
  toBatchWithConfig,
} from '@api/services/batch-generation/batch-generation.types';
import { batchItemRowsInclude } from '@api/services/batch-generation/batch-item-rows';
import type { BatchReviewLockService } from '@api/services/batch-generation/batch-review-lock';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';

export function runLockedReviewTransaction<T>(
  prisma: PrismaService,
  reviewLocks: BatchReviewLockService,
  batchId: string,
  orgId: string,
  operation: (
    transaction: Prisma.TransactionClient,
    batch: BatchWithConfig,
  ) => Promise<T>,
): Promise<T> {
  return reviewLocks.run([batchId], orgId, () =>
    prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "batches" WHERE "id" = ${batchId} AND "organizationId" = ${orgId} AND "isDeleted" = false FOR UPDATE`,
      );
      const batch = await transaction.batch.findFirst({
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      });
      if (!batch) throw new NotFoundException('Batch', batchId);
      const postIds = [
        ...new Set(
          resolveBatchItems(batch).flatMap((item) =>
            item.postId ? [item.postId] : [],
          ),
        ),
      ].sort();
      if (postIds.length)
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "posts" WHERE "id" IN (${Prisma.join(postIds)}) AND "organizationId" = ${orgId} AND "isDeleted" = false ORDER BY "id" FOR UPDATE`,
        );
      reviewLocks.assertActive();
      return operation(transaction, toBatchWithConfig(batch));
    }),
  );
}
