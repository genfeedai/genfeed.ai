import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentRuntimeState,
  resolveAgentRuntimeState,
} from '@genfeedai/contracts';
import type { WorkflowExecution } from '@genfeedai/prisma';

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
    ? AgentRuntimeState.CANCELLED
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
  prisma: Pick<PrismaService, 'workflowExecution'>,
  snapshot: AgentThreadSnapshotDocument,
): Promise<AgentThreadSnapshotDocument> {
  const execution = await prisma.workflowExecution.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      completedAt: true,
      createdAt: true,
      id: true,
      startedAt: true,
      status: true,
    },
    where: {
      AND: [
        {
          result: { equals: snapshot.threadId, path: ['metadata', 'threadId'] },
        },
        {
          OR: AGENT_CONVERSATION_WORKFLOW_IDS.map((canonicalId) => ({
            result: { equals: canonicalId, path: ['metadata', 'canonicalId'] },
          })),
        },
      ],
      isDeleted: false,
      organizationId: snapshot.organizationId,
    },
  });
  return reconcileThreadWorkflowSnapshot(snapshot, execution);
}
