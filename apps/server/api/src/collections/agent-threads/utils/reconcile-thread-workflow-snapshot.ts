import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentRuntimeState,
  resolveAgentRuntimeState,
} from '@genfeedai/contracts';
import { Prisma, type WorkflowExecution } from '@genfeedai/prisma';

type SnapshotExecution = Pick<
  WorkflowExecution,
  'id' | 'status' | 'createdAt' | 'startedAt' | 'completedAt'
>;

export function reconcileThreadWorkflowSnapshot(
  snapshot: AgentThreadSnapshotDocument,
  execution: SnapshotExecution | null,
): AgentThreadSnapshotDocument {
  if (!execution) return snapshot;

  const isSameRun = snapshot.activeRun?.runId === execution.id;
  const snapshotStatus = isSameRun ? snapshot.activeRun?.status : undefined;
  const isCancelled = execution.status === 'CANCELLED';
  const isFailed = execution.status === 'FAILED';
  const status = isCancelled
    ? snapshotStatus === AgentRuntimeState.INTERRUPTED
      ? AgentRuntimeState.INTERRUPTED
      : AgentRuntimeState.CANCELLED
    : isFailed
      ? snapshotStatus === AgentRuntimeState.INTERRUPTED
        ? AgentRuntimeState.INTERRUPTED
        : AgentRuntimeState.FAILED
      : resolveAgentRuntimeState({
          hasPendingConfirmation:
            snapshot.pendingApprovals.length > 0 ||
            Boolean(snapshot.latestProposedPlan?.awaitingApproval),
          pendingInputCount: snapshot.pendingInputRequests.length,
          snapshotStatus,
          workflowStatus: execution.status,
        });

  return {
    ...snapshot,
    activeRun: {
      ...(isSameRun ? snapshot.activeRun : {}),
      runId: execution.id,
      startedAt: (execution.startedAt ?? execution.createdAt).toISOString(),
      ...(execution.completedAt
        ? { completedAt: execution.completedAt.toISOString() }
        : {}),
      status,
    },
    ...(isCancelled || isFailed
      ? {
          pendingApprovals: [],
          pendingInputRequests: [],
          latestProposedPlan: undefined,
        }
      : {}),
  };
}

export async function readThreadWorkflowSnapshot(
  prisma: Pick<PrismaService, '$queryRaw'>,
  snapshot: AgentThreadSnapshotDocument,
): Promise<AgentThreadSnapshotDocument> {
  const branches = AGENT_CONVERSATION_WORKFLOW_IDS.map(
    (canonicalId) => Prisma.sql`
    (SELECT id, status::text, "createdAt", "startedAt", "completedAt"
     FROM workflow_executions
     WHERE "organizationId" = ${snapshot.organizationId}
       AND "isDeleted" = false
       AND (result #> '{metadata,threadId}'::text[]) = ${JSON.stringify(snapshot.threadId)}::jsonb
       AND (result #> '{metadata,canonicalId}'::text[]) = ${JSON.stringify(canonicalId)}::jsonb
     ORDER BY "createdAt" DESC, id DESC LIMIT 1)
  `,
  );
  const executions = await prisma.$queryRaw<SnapshotExecution[]>(Prisma.sql`
    SELECT id, status, "createdAt", "startedAt", "completedAt"
    FROM (${Prisma.join(branches, ' UNION ALL ')}) AS candidates
    ORDER BY "createdAt" DESC, id DESC LIMIT 1
  `);
  return reconcileThreadWorkflowSnapshot(snapshot, executions[0] ?? null);
}
