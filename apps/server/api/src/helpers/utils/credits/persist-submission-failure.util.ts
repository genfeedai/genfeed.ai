import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  generationSubmissionIntentSchema,
  submittedGenerationMetadataSchema,
} from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import {
  persistByokSubmissionFailure,
  recordByokSubmissionRejection,
} from '@api/helpers/utils/credits/persist-byok-submission-failure.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';

export {
  generationSubmissionIntentSchema,
  submittedGenerationMetadataSchema,
} from '@api/helpers/utils/credits/generation-submission-evidence.schema';

/** Capture confirmed provider failure in the transaction that changes the library row. */
export async function persistSubmissionFailure(
  prisma: PrismaService,
  where: Prisma.IngredientWhereInput,
  data: Prisma.IngredientUpdateManyMutationInput,
  isFailureConfirmed: boolean,
): Promise<{ count: number } | null> {
  if (
    !isFailureConfirmed ||
    data.status !== IngredientStatus.FAILED ||
    typeof where.id !== 'string' ||
    typeof where.organizationId !== 'string'
  )
    return null;
  const { id: ingredientId, organizationId } = where;
  const candidate = await prisma.creditReservation.findFirst({
    where: {
      organizationId,
      isDeleted: false,
      workloadId: ingredientId,
      workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
    },
  });
  if (!generationSubmissionIntentSchema.safeParse(candidate?.metadata).success)
    return persistByokSubmissionFailure(prisma, where, data);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const hold = await lockSubmissionHold(
            tx,
            ingredientId,
            organizationId,
          );
          if (!hold)
            throw new BusinessLogicException(
              'Submitted generation hold disappeared',
            );
          const evidence = submittedGenerationMetadataSchema.parse(
            hold.metadata,
          );
          if (evidence.assetId !== ingredientId)
            throw new BusinessLogicException(
              'Submitted generation owner differs',
            );
          const changed = await tx.ingredient.updateMany({
            where: {
              AND: [where],
              id: ingredientId,
              organizationId,
              isDeleted: false,
              status:
                where.status === IngredientStatus.FAILED
                  ? IngredientStatus.FAILED
                  : IngredientStatus.PROCESSING,
            },
            data,
          });
          if (changed.count !== 1) return changed;
          await recordFailure(
            tx,
            hold,
            ingredientId,
            organizationId,
            'provider-terminal',
          );
          return changed;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
    }
  }
}

/** Submission rejection is authoritative even before the library failure projection is saved. */
export async function persistSubmissionRejection(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const hold = await lockSubmissionHold(tx, ingredientId, organizationId);
      if (
        !hold ||
        !generationSubmissionIntentSchema.safeParse(hold.metadata).success
      ) {
        await recordByokSubmissionRejection(tx, ingredientId, organizationId);
        return;
      }
      await recordFailure(
        tx,
        hold,
        ingredientId,
        organizationId,
        'submission-rejected',
      );
    },
    { isolationLevel: 'Serializable' },
  );
}

async function lockSubmissionHold(
  tx: Prisma.TransactionClient,
  ingredientId: string,
  organizationId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "organizationId" = ${organizationId} AND "workloadId" = ${ingredientId} AND "workloadType" = ${MEDIA_GENERATION_WORKLOAD_TYPE} AND "isDeleted" = false FOR UPDATE`,
  );
  return tx.creditReservation.findFirst({
    where: {
      organizationId,
      isDeleted: false,
      workloadId: ingredientId,
      workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
    },
  });
}

async function recordFailure(
  tx: Prisma.TransactionClient,
  hold: { id: string; status: string; metadata: Prisma.JsonValue },
  ingredientId: string,
  organizationId: string,
  kind: 'submission-rejected' | 'provider-terminal',
): Promise<void> {
  const parsed = submittedGenerationMetadataSchema.parse(hold.metadata);
  if (parsed.assetId !== ingredientId)
    throw new BusinessLogicException('Submitted generation owner differs');
  if (parsed.confirmedFailure) {
    if (
      parsed.confirmedFailure.ingredientId !== ingredientId ||
      parsed.confirmedFailure.provider !== parsed.submissionIntent.provider
    )
      throw new BusinessLogicException(
        'Submitted generation negative proof differs',
      );
    return;
  }
  if (
    kind === 'submission-rejected' &&
    parsed.submissionIntent.provider !== 'heygen'
  )
    throw new BusinessLogicException('Submission rejection provider differs');
  if (hold.status !== CreditReservationStatus.RESERVED)
    throw new BusinessLogicException('Submitted generation hold already ended');
  if (
    !hold.metadata ||
    typeof hold.metadata !== 'object' ||
    Array.isArray(hold.metadata)
  )
    throw new BusinessLogicException(
      'Submitted generation evidence is unavailable',
    );
  const saved = await tx.creditReservation.updateMany({
    where: {
      id: hold.id,
      organizationId,
      isDeleted: false,
      status: CreditReservationStatus.RESERVED,
      metadata: { equals: toPrismaJson(hold.metadata) },
    },
    data: {
      metadata: toPrismaJson({
        ...hold.metadata,
        confirmedFailure: {
          version: 1,
          ingredientId,
          provider: parsed.submissionIntent.provider,
          kind,
          observedAt: new Date().toISOString(),
        },
      }),
    },
  });
  if (saved.count !== 1)
    throw new BusinessLogicException('Submitted generation evidence changed');
}
