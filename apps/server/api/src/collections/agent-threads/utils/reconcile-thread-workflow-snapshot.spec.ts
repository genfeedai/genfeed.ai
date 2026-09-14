import {
  readThreadWorkflowSnapshot,
  reconcileThreadWorkflowSnapshot,
} from '@api/collections/agent-threads/utils/reconcile-thread-workflow-snapshot';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma, WorkflowExecution } from '@genfeedai/prisma';

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
        options: [],
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
        options: [],
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
  it.each(['thread', `thread'"; DROP TABLE workflow_executions; -- 雪`])(
    'binds all identities and bounds each conversation branch for %s',
    async (threadId) => {
      const $queryRaw = vi.fn().mockResolvedValue([execution()]);
      const prisma = { $queryRaw } as unknown as Pick<
        PrismaService,
        '$queryRaw'
      >;
      const current = { ...snapshot(), organizationId: `org'雪`, threadId };
      const result = await readThreadWorkflowSnapshot(prisma, current);
      expect(result.activeRun?.runId).toBe('current-execution');
      expect($queryRaw).toHaveBeenCalledTimes(1);
      const query = $queryRaw.mock.calls[0][0] as Prisma.Sql;
      const branches = query.sql.split(' UNION ALL ');
      expect(branches).toHaveLength(3);
      for (const branch of branches) {
        expect(branch).toContain('"organizationId" = ?');
        expect(branch).toContain('"isDeleted" = false');
        expect(branch).toContain("result #> '{metadata,threadId}'::text[]");
        expect(branch).toContain("result #> '{metadata,canonicalId}'::text[]");
        expect(branch).toContain('ORDER BY "createdAt" DESC, id DESC LIMIT 1');
      }
      expect(
        query.sql.match(/ORDER BY "createdAt" DESC, id DESC LIMIT 1/g),
      ).toHaveLength(4);
      expect(query.sql).toContain('status::text');
      expect(query.sql).not.toContain(JSON.stringify(threadId));
      expect(query.sql).not.toContain(current.organizationId);
      expect(query.values).toEqual([
        current.organizationId,
        JSON.stringify(threadId),
        JSON.stringify('agent.turn.execute'),
        current.organizationId,
        JSON.stringify(threadId),
        JSON.stringify('agent.thread.ui-action'),
        current.organizationId,
        JSON.stringify(threadId),
        JSON.stringify('agent.thread.input-response'),
      ]);
    },
  );
  it('returns the original snapshot when the query has no match', async () => {
    const $queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw } as unknown as Pick<PrismaService, '$queryRaw'>;
    const current = snapshot();
    expect(await readThreadWorkflowSnapshot(prisma, current)).toBe(current);
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });
});

it('preserves a correlated tool interruption over the cancelled workflow status', () => {
  const current = snapshot();
  current.activeRun = { runId: 'current-execution', status: 'interrupted' };
  expect(
    reconcileThreadWorkflowSnapshot(current, execution('CANCELLED')).activeRun
      ?.status,
  ).toBe('interrupted');
});
