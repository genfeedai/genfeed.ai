import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import {
  type TurboRunWithConfig,
  resolveTurboRunItems,
  toTurboRunWithConfig,
} from '@api/services/turbo-run/turbo-run.types';
import { turboRunItemRowsInclude } from '@api/services/turbo-run/turbo-run-item-rows';
import type { TurboRunReviewLockService } from '@api/services/turbo-run/turbo-run-review-lock';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';

export function runLockedReviewTransaction<T>(
  prisma: PrismaService,
  reviewLocks: TurboRunReviewLockService,
  turboRunId: string,
  orgId: string,
  operation: (
    transaction: Prisma.TransactionClient,
    turboRun: TurboRunWithConfig,
  ) => Promise<T>,
): Promise<T> {
  return reviewLocks.run([turboRunId], orgId, () =>
    prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "turbo-runs" WHERE "id" = ${turboRunId} AND "organizationId" = ${orgId} AND "isDeleted" = false FOR UPDATE`,
      );
      const turboRun = await transaction.turboRun.findFirst({
        include: turboRunItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: turboRunId }),
      });
      if (!turboRun) throw new NotFoundException('TurboRun', turboRunId);
      const postIds = [
        ...new Set(
          resolveTurboRunItems(turboRun).flatMap((item) =>
            item.postId ? [item.postId] : [],
          ),
        ),
      ].sort();
      if (postIds.length)
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "posts" WHERE "id" IN (${Prisma.join(postIds)}) AND "organizationId" = ${orgId} AND "isDeleted" = false ORDER BY "id" FOR UPDATE`,
        );
      reviewLocks.assertActive();
      return operation(transaction, toTurboRunWithConfig(turboRun));
    }),
  );
}
