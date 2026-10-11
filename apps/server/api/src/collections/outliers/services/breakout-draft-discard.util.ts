import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';

/**
 * Soft-deletes a paid draft (and its thread segments) that is not linked to any output, so a
 * draft nothing can find, review or recover is never left behind. A linked draft is never
 * touched. The spend stays on the ledger and the receipt.
 */
export async function discardUnlinkedBreakoutDraft(
  prisma: Pick<PrismaService, '$transaction'>,
  admission: Readonly<BreakoutGenerationAdmission>,
  postId: string,
): Promise<void> {
  const { scope } = admission;
  await prisma.$transaction(async (tx) => {
    await admission.reauthorize(tx);
    await tx.post.updateMany({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        credentialId: admission.credentialId,
        breakoutOutputId: null,
        targetExecutionState: TargetExecutionState.DRAFT,
        OR: [{ id: postId }, { parentId: postId }],
      }),
      data: { isDeleted: true },
    });
  });
}
