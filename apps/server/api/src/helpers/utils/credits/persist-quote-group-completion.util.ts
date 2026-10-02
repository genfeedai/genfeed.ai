import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  crunFailureKind,
  generationQuoteGroupMetadataSchema,
  generationQuoteGroupReceiptSchema,
} from '@api/helpers/utils/credits/generation-quote-group.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';

/** Save financial completion evidence atomically with the durable library artifact. */
export async function persistQuoteGroupDisposition(
  prisma: PrismaService,
  where: Prisma.IngredientWhereInput,
  data: Prisma.IngredientUpdateManyMutationInput,
  isFailureConfirmed = false,
): Promise<{ count: number } | null> {
  const isCompletion =
    data.status === IngredientStatus.GENERATED &&
    typeof data.s3Key === 'string' &&
    Boolean(data.s3Key);
  const isConfirmedFailure = data.status === IngredientStatus.FAILED;
  if (
    (!isCompletion && !isConfirmedFailure) ||
    typeof where.id !== 'string' ||
    typeof where.organizationId !== 'string'
  )
    return null;
  const ingredientId = where.id;
  const organizationId = where.organizationId;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const candidate = await tx.ingredient.findFirst({
            where: { id: ingredientId, organizationId, isDeleted: false },
            select: { generationBilling: true },
          });
          const receipt = generationQuoteGroupReceiptSchema.safeParse(
            candidate?.generationBilling,
          );
          if (!receipt.success) return null;
          const hold = await tx.creditReservation.findFirst({
            where: {
              id: receipt.data.reservationId,
              organizationId,
              isDeleted: false,
              workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
            },
          });
          if (!hold || hold.status !== CreditReservationStatus.RESERVED)
            throw new BusinessLogicException(
              'Completed generation quote hold is unavailable',
            );
          const metadata = generationQuoteGroupMetadataSchema.parse(
            hold.metadata,
          );
          if (isConfirmedFailure) {
            if (metadata.modelQuote.providerQuote) {
              const task = await tx.crunGenerationTask.findFirst({
                where: {
                  ingredientId,
                  organizationId,
                  isDeleted: false,
                  reservationId: hold.id,
                },
              });
              if (!crunFailureKind(task)) return { count: 0 };
            } else if (!isFailureConfirmed) return null;
          }
          if (!metadata.boundOutputIds.includes(ingredientId))
            throw new BusinessLogicException(
              'Completed output is absent from its funded manifest',
            );
          const completed = await tx.ingredient.updateMany({
            where: {
              AND: [where],
              organizationId,
              isDeleted: false,
              status: IngredientStatus.PROCESSING,
              generationBilling: { equals: toPrismaJson(receipt.data) },
            },
            data,
          });
          if (completed.count !== 1) return completed;
          const persisted = await tx.creditReservation.updateMany({
            where: {
              id: hold.id,
              organizationId,
              isDeleted: false,
              status: CreditReservationStatus.RESERVED,
            },
            data: {
              metadata: toPrismaJson({
                ...metadata,
                completedArtifacts:
                  !isCompletion ||
                  metadata.completedArtifacts.some(
                    (artifact) => artifact.ingredientId === ingredientId,
                  )
                    ? metadata.completedArtifacts
                    : [
                        ...metadata.completedArtifacts,
                        {
                          ingredientId,
                          s3Key: data.s3Key,
                          completedAt: new Date().toISOString(),
                        },
                      ],
                failedOutputIds:
                  !isConfirmedFailure ||
                  metadata.completedArtifacts.some(
                    (artifact) => artifact.ingredientId === ingredientId,
                  ) ||
                  metadata.failedOutputIds.includes(ingredientId)
                    ? metadata.failedOutputIds
                    : [...metadata.failedOutputIds, ingredientId],
              }),
            },
          });
          if (persisted.count !== 1)
            throw new BusinessLogicException(
              'Completed output funding changed',
            );
          return completed;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
    }
  }
}
