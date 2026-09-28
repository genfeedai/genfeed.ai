import { scopedWhere } from '@api/index';
import type { PrismaClient } from '@genfeedai/prisma';

/**
 * The live review batch already holding one of these review sources, if any:
 * a batch whose creation committed before the project saved its id. Items
 * carry their `sourceActionId` inside the typed row's `data` JSON.
 */
export async function findReviewBatchIdBySourceKeys(
  prisma: Pick<PrismaClient, 'batchItem'>,
  organizationId: string,
  sourceKeys: string[],
): Promise<string | null> {
  if (sourceKeys.length === 0) {
    return null;
  }
  const row = await prisma.batchItem.findFirst({
    select: { batchId: true },
    where: scopedWhere(organizationId, {
      batch: { isDeleted: false, organizationId },
      OR: sourceKeys.map((sourceKey) => ({
        data: { equals: sourceKey, path: ['sourceActionId'] },
      })),
    }),
  });
  return row?.batchId ?? null;
}
