import type { Prisma } from '@genfeedai/prisma';

/**
 * Unlink agent thread parents that would straddle a brand's move to another
 * organization. The parent link is a composite (parentThreadId, organizationId)
 * key, so a moved thread cannot keep a parent that stays behind, and a
 * stay-behind child would be dragged along by ON UPDATE CASCADE when its parent
 * moves. Links between two moving threads, or two staying ones, are kept.
 * Runs in the caller's transaction, before any organization id is rewritten.
 */
export async function unlinkStraddlingAgentThreadParents(
  tx: Prisma.TransactionClient,
  brandId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "agent_threads" AS child
    SET "parentThreadId" = NULL
    FROM "agent_threads" AS parent
    WHERE child."parentThreadId" = parent."id"
      AND child."organizationId" = parent."organizationId"
      AND (child."brandId" = ${brandId}) IS DISTINCT FROM (parent."brandId" = ${brandId})
      AND (child."brandId" = ${brandId} OR parent."brandId" = ${brandId})
  `;
}
