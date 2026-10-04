import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { hasGenerationLineProtocol } from '@api/helpers/utils/credits/generation-line-reservation.util';
import {
  generationQuoteGroupMetadataSchema,
  generationQuoteGroupReceiptSchema,
} from '@api/helpers/utils/credits/generation-quote-group.schema';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { failedReceipt } from '@api/helpers/utils/credits/persist-byok-submission-failure.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { z } from 'zod';

interface ReservationReleaser {
  releaseReservation(input: {
    organizationId: string;
    reservationId: string;
    expectedReservationMetadata: Record<string, unknown>;
  }): Promise<unknown>;
}

/** A Crun dispatch prepares its tasks in seconds; older taskless outputs were abandoned. */
const ABANDONED_DISPATCH_AGE_MS = 15 * 60 * 1000;
const SWEEP_BATCH = 200;

const recordSchema = z.record(z.string(), z.unknown());

async function serializable<T>(
  prisma: PrismaService,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(run, { isolationLevel: 'Serializable' });
    } catch (error: unknown) {
      if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
    }
  }
}

/**
 * Pre-submission abort for a Crun output that never got a durable task row.
 * No provider request can exist without that row, so the output is provably
 * unfunded. Three idempotent steps, so a failure after any of them is retried
 * by the sweep while the ingredient is still PROCESSING:
 * 1. drop the output from its quote group's funded manifest and record the
 *    abort on the hold (`abortedOutputIds`);
 * 2. release the hold once the group has no bound output and no task;
 * 3. fail the ingredient (a BYOK receipt gets submission-rejected proof).
 * An output that already has a task row is owned by the task-based path.
 */
export async function abortUnsubmittedCrunOutput(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
  credits: ReservationReleaser,
): Promise<void> {
  const target = await serializable(prisma, async (tx) => {
    const task = await tx.crunGenerationTask.findFirst({
      where: { ingredientId, organizationId, isDeleted: false },
    });
    if (task) return 'skip' as const;
    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredientId, organizationId, isDeleted: false },
      select: { generationBilling: true, status: true },
    });
    if (!ingredient || ingredient.status !== IngredientStatus.PROCESSING)
      return 'skip' as const;
    const group = generationQuoteGroupReceiptSchema.safeParse(
      ingredient.generationBilling,
    );
    if (!group.success) return null;
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "id" = ${group.data.reservationId} AND "organizationId" = ${organizationId} FOR UPDATE`,
    );
    const hold = await tx.creditReservation.findFirst({
      where: {
        id: group.data.reservationId,
        organizationId,
        isDeleted: false,
        workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      },
    });
    if (
      !hold ||
      hold.status !== CreditReservationStatus.RESERVED ||
      hasGenerationLineProtocol(hold.metadata)
    )
      return null;
    const raw = recordSchema.parse(hold.metadata);
    const metadata = generationQuoteGroupMetadataSchema.parse(raw);
    let current = raw;
    if (metadata.boundOutputIds.includes(ingredientId)) {
      const aborted = Array.isArray(raw.abortedOutputIds)
        ? raw.abortedOutputIds
        : [];
      current = {
        ...raw,
        boundOutputIds: metadata.boundOutputIds.filter(
          (id) => id !== ingredientId,
        ),
        abortedOutputIds: [...aborted, ingredientId],
      };
      const saved = await tx.creditReservation.updateMany({
        where: {
          id: hold.id,
          organizationId,
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          metadata: { equals: toPrismaJson(raw) },
        },
        data: { metadata: toPrismaJson(current) },
      });
      if (saved.count !== 1) throw new Error('Quote group evidence changed');
    }
    const remaining = generationQuoteGroupMetadataSchema.parse(current);
    const tasks = await tx.crunGenerationTask.count({
      where: { reservationId: hold.id, organizationId, isDeleted: false },
    });
    return remaining.boundOutputIds.length === 0 && tasks === 0
      ? { reservationId: hold.id, metadata: current }
      : null;
  });
  if (target === 'skip') return;
  if (target)
    await credits.releaseReservation({
      organizationId,
      reservationId: target.reservationId,
      expectedReservationMetadata: target.metadata,
    });
  await serializable(prisma, async (tx) => {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredientId, organizationId, isDeleted: false },
      select: { generationBilling: true, status: true },
    });
    if (!ingredient || ingredient.status !== IngredientStatus.PROCESSING)
      return;
    const receipt = generationUsageReceiptSchema.safeParse(
      ingredient.generationBilling,
    );
    const failedByokReceipt =
      receipt.success &&
      receipt.data.submissionIntentProvider === 'crun' &&
      receipt.data.state === 'pending'
        ? failedReceipt(
            recordSchema.parse(ingredient.generationBilling),
            receipt.data,
            ingredientId,
            'submission-rejected',
          )
        : null;
    await tx.ingredient.updateMany({
      where: scopedWhere(organizationId, {
        id: ingredientId,
        organizationId,
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
        ...(ingredient.generationBilling === null
          ? {}
          : {
              generationBilling: {
                equals: toPrismaJson(ingredient.generationBilling),
              },
            }),
      }),
      data: {
        status: IngredientStatus.FAILED,
        ...(failedByokReceipt
          ? { generationBilling: toPrismaJson(failedByokReceipt) }
          : {}),
      },
    });
  });
}

/**
 * Retry for aborts whose cleanup failed: Crun outputs still PROCESSING with no
 * task row long after dispatch could have run. Returns how many it aborted.
 */
export async function sweepAbortedCrunDispatches(
  prisma: PrismaService,
  logger: Pick<LoggerService, 'error'>,
  credits: ReservationReleaser,
  now: Date,
): Promise<number> {
  // tenant-scope-ignore: platform sweep; every abort re-enters the row's tenant scope
  const rows = await prisma.ingredient.findMany({
    orderBy: { createdAt: 'asc' },
    take: SWEEP_BATCH,
    select: { id: true, organizationId: true },
    where: {
      isDeleted: false,
      status: IngredientStatus.PROCESSING,
      modelUsed: { startsWith: 'crun/' },
      organizationId: { not: null },
      createdAt: { lte: new Date(now.getTime() - ABANDONED_DISPATCH_AGE_MS) },
    },
  });
  let acted = 0;
  for (const row of rows) {
    if (!row.organizationId) continue;
    try {
      await abortUnsubmittedCrunOutput(
        prisma,
        row.id,
        row.organizationId,
        credits,
      );
      acted += 1;
    } catch (error: unknown) {
      logger.error('Crun dispatch abort retry failed', error, {
        ingredientId: row.id,
        organizationId: row.organizationId,
      });
    }
  }
  return acted;
}
