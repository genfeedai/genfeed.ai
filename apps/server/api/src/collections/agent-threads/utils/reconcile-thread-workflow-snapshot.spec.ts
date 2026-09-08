import {
  readThreadWorkflowSnapshot,
  reconcileThreadWorkflowSnapshot,
} from '@api/collections/agent-threads/utils/reconcile-thread-workflow-snapshot';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { WorkflowExecution } from '@genfeedai/prisma';

const createdAt = new Date('2026-09-08T10:00:00.000Z');
function snapshot(): AgentThreadSnapshotDocument {
  return {
    id: 'snapshot',
    threadId: 'thread',
    organizationId: 'org',
    isDeleted: false,
    createdAt,
    updatedAt: createdAt,
    data: {},
    lastSequence: 0,
    memorySummaryRefs: [],
    pendingApprovals: [],
    pendingInputRequests: [],
    timeline: [],
  };
}
function execution(status: WorkflowExecution['status'] = 'PENDING') {
  return {
    id: 'current-execution',
    status,
    createdAt,
    startedAt: null,
    completedAt: null,
  };
}
describe('durable workflow snapshot recovery', () => {
  it('restores a queued accepted run before the worker emits its first event', () => {
    expect(
      reconcileThreadWorkflowSnapshot(snapshot(), execution()).activeRun,
    ).toEqual({
      runId: 'current-execution',
      startedAt: createdAt.toISOString(),
      status: 'running',
    });
  });
  it('does not let an older terminal snapshot hide a newly accepted turn', () => {
    const current = snapshot();
    current.activeRun = {
      runId: 'old-execution',
      status: 'failed',
      model: 'old-model',
    };
    expect(
      reconcileThreadWorkflowSnapshot(current, execution()).activeRun,
    ).toEqual({
      runId: 'current-execution',
      startedAt: createdAt.toISOString(),
      status: 'running',
    });
  });
  it.each(['FAILED', 'CANCELLED', 'COMPLETED'] as const)(
    'reconciles a stale running snapshot to %s',
    (status) => {
      const current = snapshot();
      current.activeRun = { runId: 'current-execution', status: 'running' };
      expect(
        reconcileThreadWorkflowSnapshot(current, execution(status)).activeRun
          ?.status,
      ).toBe(status.toLowerCase());
      expect(current.activeRun.status).toBe('running');
    },
  );
  it('preserves interrupted classification when its outer workflow fails', () => {
    const current = snapshot();
    current.activeRun = { runId: 'current-execution', status: 'interrupted' };
    expect(
      reconcileThreadWorkflowSnapshot(current, execution('FAILED')).activeRun
        ?.status,
    ).toBe('interrupted');
  });
  it('preserves a decision after the inference workflow has completed', () => {
    const current = snapshot();
    current.pendingInputRequests = [
      {
        requestId: 'choice',
        title: 'Format',
        prompt: 'Choose',
        createdAt: createdAt.toISOString(),
      },
    ];
    expect(
      reconcileThreadWorkflowSnapshot(current, execution('COMPLETED')).activeRun
        ?.status,
    ).toBe('awaiting_input');
  });
  it('removes stale decision controls when the durable workflow is cancelled', () => {
    const current = snapshot();
    current.pendingInputRequests = [
      {
        requestId: 'choice',
        title: 'Format',
        prompt: 'Choose',
        createdAt: createdAt.toISOString(),
      },
    ];
    const result = reconcileThreadWorkflowSnapshot(
      current,
      execution('CANCELLED'),
    );
    expect(result.activeRun?.status).toBe('cancelled');
    expect(result.pendingInputRequests).toEqual([]);
    expect(current.pendingInputRequests).toHaveLength(1);
  });
  it('keeps existing state when no governed workflow exists', () => {
    const current = snapshot();
    expect(reconcileThreadWorkflowSnapshot(current, null)).toBe(current);
  });
  it('reads only non-deleted conversation executions in the authorized organization and thread', async () => {
    const findFirst = vi.fn().mockResolvedValue(execution());
    const prisma = { workflowExecution: { findFirst } } as unknown as Pick<
      PrismaService,
      'workflowExecution'
    >;
    await readThreadWorkflowSnapshot(prisma, snapshot());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          AND: expect.arrayContaining([
            { result: { equals: 'thread', path: ['metadata', 'threadId'] } },
            {
              OR: expect.arrayContaining([
                {
                  result: {
                    equals: 'agent.turn.execute',
                    path: ['metadata', 'canonicalId'],
                  },
                },
              ]),
            },
          ]),
        }),
      }),
    );
  });
});
