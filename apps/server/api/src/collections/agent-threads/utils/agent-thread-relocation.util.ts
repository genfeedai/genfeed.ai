import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

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

/**
 * Remove the thread shares a brand's move to another organization would
 * otherwise carry or break (#9936). A share keeps composite (threadId,
 * organizationId) and (targetBrandId, organizationId) keys, so ON UPDATE
 * CASCADE would drag an organization-wide or member share along with a moved
 * thread into an organization its owner never chose, and a share whose thread
 * and target brand sit on opposite sides of the move would fail the whole
 * relocation. Sharing is a grant inside one organization: the move ends it. The
 * rows are deleted rather than soft-deleted because a soft-deleted row still
 * holds the foreign keys. Runs in the caller's transaction, before any
 * organization id is rewritten.
 */
export const deleteAgentThreadSharesForRelocation = traced(
  'deleteAgentThreadSharesForRelocation',
  async (tx: Prisma.TransactionClient, brandId: string): Promise<void> => {
    // sql-risk-audit: ignore raw-sql-review -- Joins on the thread and organization keys (both indexed by their foreign keys) and touches only the moving brand's shares.
    await tx.$executeRaw`
      DELETE FROM "agent_thread_shares" AS share
      USING "agent_threads" AS thread
      WHERE share."threadId" = thread."id"
        AND share."organizationId" = thread."organizationId"
        AND (thread."brandId" = ${brandId} OR share."targetBrandId" = ${brandId})
    `;
  },
);

/**
 * Everything an agent thread needs before its brand moves to another
 * organization: straddling parent links are cleared and shares are dropped.
 */
export const prepareAgentThreadsForRelocation = traced(
  'prepareAgentThreadsForRelocation',
  async (tx: Prisma.TransactionClient, brandId: string): Promise<void> => {
    await unlinkStraddlingAgentThreadParents(tx, brandId);
    await deleteAgentThreadSharesForRelocation(tx, brandId);
  },
);
