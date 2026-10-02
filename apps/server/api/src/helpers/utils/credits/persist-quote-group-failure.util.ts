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
import { toPrismaJson } from '@genfeedai/prisma';

/** Call only after definitive provider failure/cancellation or a verified unproduced batch slot. */
export async function persistQuoteGroupFailure(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const output = await tx.ingredient.findFirst({
            where: { id: ingredientId, organizationId, isDeleted: false },
            select: { generationBilling: true, status: true },
          });
          const receipt = generationQuoteGroupReceiptSchema.safeParse(
            output?.generationBilling,
          );
          if (!receipt.success || output?.status !== IngredientStatus.FAILED)
            return;
          const hold = await tx.creditReservation.findFirst({
            where: {
              id: receipt.data.reservationId,
              organizationId,
              isDeleted: false,
              workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
            },
          });
          if (!hold || hold.status !== CreditReservationStatus.RESERVED) return;
          const metadata = generationQuoteGroupMetadataSchema.parse(
            hold.metadata,
          );
          if (metadata.modelQuote.providerQuote) {
            const task = await tx.crunGenerationTask.findFirst({
              where: {
                ingredientId,
                organizationId,
                isDeleted: false,
                reservationId: hold.id,
              },
            });
            if (!crunFailureKind(task)) return;
          }
          if (!metadata.boundOutputIds.includes(ingredientId))
            throw new BusinessLogicException(
              'Failed output is absent from its funded manifest',
            );
          if (
            metadata.completedArtifacts.some(
              (artifact) => artifact.ingredientId === ingredientId,
            ) ||
            metadata.failedOutputIds.includes(ingredientId)
          )
            return;
          await tx.creditReservation.updateMany({
            where: {
              id: hold.id,
              organizationId,
              isDeleted: false,
              status: CreditReservationStatus.RESERVED,
            },
            data: {
              metadata: toPrismaJson({
                ...metadata,
                failedOutputIds: [...metadata.failedOutputIds, ingredientId],
              }),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return;
    } catch (error: unknown) {
      if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
    }
  }
}
