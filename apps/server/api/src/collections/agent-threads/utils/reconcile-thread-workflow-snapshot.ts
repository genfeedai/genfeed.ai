import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentRuntimeState,
  resolveAgentRuntimeState,
} from '@genfeedai/contracts';
import type {
  AgentThreadUiActionRun,
  AgentThreadUiActionStatus,
} from '@genfeedai/contracts/interfaces';
import { Prisma, type WorkflowExecution } from '@genfeedai/prisma';

type SnapshotExecution = Pick<
  WorkflowExecution,
  'id' | 'status' | 'createdAt' | 'startedAt' | 'completedAt'
>;

function uiActionStatusFor(
  status: SnapshotExecution['status'],
): Exclude<AgentThreadUiActionStatus, 'pending'> | null {
  switch (status) {
    case 'CANCELLED':
      return 'cancelled';
    case 'FAILED':
      return 'failed';
    case 'COMPLETED':
      return 'completed';
    default:
      return null;
  }
}

/**
 * A ui-action run that ended without recording its terminal event (a crash,
 * a cancellation it never observed) still settles the state it opened, from
 * its execution's own status. Runs still queued or running stay pending.
 */
function settleUiActionRuns(
  states: AgentThreadUiActionRun[] | undefined,
  executions: readonly SnapshotExecution[],
): AgentThreadUiActionRun[] | undefined {
  if (!states) return states;
  const byId = new Map(
    executions.map((execution) => [execution.id, execution]),
  );
  return states.map((state) => {
    const execution = byId.get(state.runId);
    const status = execution ? uiActionStatusFor(execution.status) : null;
    if (state.status !== 'pending' || !execution || !status) return state;
    return {
      ...state,
      status,
      updatedAt: (execution.completedAt ?? execution.createdAt).toISOString(),
      ...(status === 'completed'
        ? {}
        : {
            error:
              status === 'cancelled'
                ? 'The action was cancelled.'
                : 'The action failed before it finished.',
          }),
    };
  });
}

const TERMINAL_EXECUTION_STATUSES: ReadonlySet<SnapshotExecution['status']> =
  new Set(['CANCELLED', 'COMPLETED', 'FAILED']);

/** The run the worker started and has not terminated: it owns the lane. */
function readLaneOwnerRunId(
  snapshot: AgentThreadSnapshotDocument,
): string | null {
  const owner = snapshot.activeRun;
  return owner?.runId &&
    (owner.status === 'queued' || owner.status === 'running')
    ? owner.runId
    : null;
}

/**
 * Reconciles the projected snapshot with durable execution state. `latest`
 * is the thread's newest conversation execution; `relatedExecutions` are the
 * executions of its pending ui-action runs and of the run that owns the lane.
 * A newer execution only becomes the active run once it has started or the
 * lane owner has ended: a queued run never displaces the running one.
 */
export function reconcileThreadWorkflowSnapshot(
  snapshot: AgentThreadSnapshotDocument,
  latest: SnapshotExecution | null,
  relatedExecutions: readonly SnapshotExecution[] = [],
): AgentThreadSnapshotDocument {
  const uiActionRuns = settleUiActionRuns(
    snapshot.uiActionRuns,
    latest ? [latest, ...relatedExecutions] : relatedExecutions,
  );
  const settled = uiActionRuns ? { ...snapshot, uiActionRuns } : snapshot;

  let execution = latest;
  const laneOwnerRunId = readLaneOwnerRunId(snapshot);
  if (
    laneOwnerRunId &&
    latest &&
    latest.id !== laneOwnerRunId &&
    latest.status === 'PENDING'
  ) {
    const ownerExecution = relatedExecutions.find(
      (candidate) => candidate.id === laneOwnerRunId,
    );
    if (
      ownerExecution &&
      !TERMINAL_EXECUTION_STATUSES.has(ownerExecution.status)
    ) {
      execution = ownerExecution;
    }
  }
  if (!execution) return settled;

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
    ...settled,
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
  const latest = executions[0] ?? null;
  // Pending ui-action runs settle from their own executions, and the run that
  // owns the lane keeps it until its own execution ends.
  const laneOwnerRunId = readLaneOwnerRunId(snapshot);
  const relatedRunIds = [
    ...new Set([
      ...(snapshot.uiActionRuns ?? [])
        .filter((run) => run.status === 'pending')
        .map((run) => run.runId),
      ...(laneOwnerRunId ? [laneOwnerRunId] : []),
    ]),
  ].filter((runId) => runId !== latest?.id);
  const relatedExecutions = relatedRunIds.length
    ? await prisma.$queryRaw<SnapshotExecution[]>(Prisma.sql`
        SELECT id, status::text AS status, "createdAt", "startedAt", "completedAt"
        FROM workflow_executions
        WHERE "organizationId" = ${snapshot.organizationId}
          AND "isDeleted" = false
          AND id IN (${Prisma.join(relatedRunIds)})
      `)
    : [];
  return reconcileThreadWorkflowSnapshot(snapshot, latest, relatedExecutions);
}
