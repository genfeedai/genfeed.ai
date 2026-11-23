import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import { scopedWhere } from '@api/index';
import { oldestPendingInputAt } from '@api/services/agent-threading/utils/oldest-pending-input-at.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { toPrismaJson } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

export interface UpdateSnapshotDataParams {
  organizationId: string;
  threadId: string;
  /** Returns the whole next `data`; it must be pure, because it can run again on a retry. */
  change: (data: Record<string, unknown>) => Record<string, unknown>;
  /** The `data` of a snapshot created when the thread has none yet. Leave out to write nothing then. */
  createWith?: Record<string, unknown>;
}

/**
 * Changes `agent_thread_snapshots.data` as one read and write in a Serializable
 * transaction, the way the thread engine appends an event (#10906). The write
 * replaces the whole `data`, so a read taken outside the transaction could
 * restore an older copy over an event that committed in between: a dropped
 * pending question, or an answered one brought back. A concurrent commit aborts
 * one of the two transactions, and the abort is retried against what was
 * committed.
 *
 * `pendingInputAt` is derived from the list the write carries, so it never
 * disagrees with it.
 *
 * @returns the stored row, or null when the thread has no snapshot and
 * `createWith` is not given.
 */
export const updateSnapshotData = traced(
  'updateSnapshotData',
  async (prisma: PrismaService, params: UpdateSnapshotDataParams) => {
    const { organizationId, threadId } = params;
    return runSerializableWithRetry(prisma, async (tx) => {
      const existing = await tx.agentThreadSnapshot.findFirst({
        select: { data: true, id: true },
        where: scopedWhere(organizationId, { threadId }),
      });
      if (!existing) {
        if (!params.createWith) return null;
        return tx.agentThreadSnapshot.create({
          data: {
            data: toPrismaJson(params.createWith),
            isDeleted: false,
            organizationId,
            threadId,
          },
        });
      }
      const next = params.change(
        (existing.data as Record<string, unknown>) ?? {},
      );
      return tx.agentThreadSnapshot.update({
        data: {
          data: toPrismaJson(next),
          pendingInputAt: oldestPendingInputAt(next.pendingInputRequests),
          updatedAt: new Date(),
        },
        where: scopedWhere(organizationId, { id: existing.id }),
      });
    });
  },
);
