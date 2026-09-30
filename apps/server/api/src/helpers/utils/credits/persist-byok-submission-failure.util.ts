import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';
import type { IGenerationUsageReceipt } from '@genfeedai/contracts/interfaces/billing';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { z } from 'zod';

/** Provider-negative proof and the BYOK receipt end with the same library CAS. */
export async function persistByokSubmissionFailure(
  prisma: PrismaService,
  where: Prisma.IngredientWhereInput,
  data: Prisma.IngredientUpdateManyMutationInput,
): Promise<{ count: number } | null> {
  if (typeof where.id !== 'string' || typeof where.organizationId !== 'string')
    return null;
  const { id: ingredientId, organizationId } = where;
  const current = await prisma.ingredient.findFirst({
    where: { id: ingredientId, organizationId, isDeleted: false },
    select: { generationBilling: true },
  });
  const receipt = generationUsageReceiptSchema.safeParse(
    current?.generationBilling,
  );
  if (!receipt.success || !receipt.data.submissionIntentProvider) return null;
  if (receipt.data.state === 'recorded') return { count: 0 };
  const raw = z
    .record(z.string(), z.unknown())
    .parse(current?.generationBilling);
  return prisma.ingredient.updateMany({
    where: {
      AND: [where],
      id: ingredientId,
      organizationId,
      isDeleted: false,
      status:
        where.status === IngredientStatus.FAILED
          ? IngredientStatus.FAILED
          : IngredientStatus.PROCESSING,
      generationBilling: { equals: toPrismaJson(raw) },
    },
    data: {
      ...data,
      generationBilling: toPrismaJson(
        failedReceipt(raw, receipt.data, ingredientId, 'provider-terminal'),
      ),
    },
  });
}

/** Persist rejection before the independent FAILED projection or receipt-release call. */
export async function recordByokSubmissionRejection(
  tx: Prisma.TransactionClient,
  ingredientId: string,
  organizationId: string,
): Promise<void> {
  const current = await tx.ingredient.findFirst({
    where: { id: ingredientId, organizationId, isDeleted: false },
    select: { generationBilling: true, status: true },
  });
  const receipt = generationUsageReceiptSchema.safeParse(
    current?.generationBilling,
  );
  if (!receipt.success || !receipt.data.submissionIntentProvider) return;
  if (receipt.data.submissionIntentProvider !== 'heygen')
    throw new BusinessLogicException('Submission rejection provider differs');
  if (
    receipt.data.state === 'failed' &&
    receipt.data.confirmedFailure?.ingredientId === ingredientId
  )
    return;
  if (
    receipt.data.state !== 'pending' ||
    current?.status === IngredientStatus.GENERATED ||
    current?.status === IngredientStatus.VALIDATED
  )
    throw new BusinessLogicException(
      'Submission rejection conflicts with completed BYOK usage',
    );
  const raw = z
    .record(z.string(), z.unknown())
    .parse(current?.generationBilling);
  const saved = await tx.ingredient.updateMany({
    where: {
      id: ingredientId,
      organizationId,
      isDeleted: false,
      status: {
        notIn: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
      },
      generationBilling: { equals: toPrismaJson(raw) },
    },
    data: {
      generationBilling: toPrismaJson(
        failedReceipt(raw, receipt.data, ingredientId, 'submission-rejected'),
      ),
    },
  });
  if (saved.count !== 1)
    throw new BusinessLogicException('BYOK submission evidence changed');
}

function failedReceipt(
  raw: Record<string, unknown>,
  receipt: IGenerationUsageReceipt,
  ingredientId: string,
  kind: 'submission-rejected' | 'provider-terminal',
) {
  return {
    ...raw,
    state: 'failed',
    confirmedFailure: {
      version: 1,
      ingredientId,
      provider: receipt.submissionIntentProvider,
      kind,
      observedAt: new Date().toISOString(),
    },
  };
}
