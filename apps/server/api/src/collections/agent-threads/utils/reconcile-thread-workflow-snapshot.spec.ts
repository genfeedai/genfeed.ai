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
  it.each([
    ['FAILED', 'failed', 'The action failed before it finished.'],
    ['CANCELLED', 'cancelled', 'The action was cancelled.'],
    ['COMPLETED', 'completed', undefined],
  ] as const)(
    'settles the pending ui-action of a %s execution that recorded no outcome',
    (status, uiActionStatus, error) => {
      const current = snapshot();
      current.activeRun = { runId: 'current-execution', status: 'running' };
      current.uiActionRuns = [
        {
          action: 'confirm_generate_media',
          queuedSequence: 3,
          runId: 'current-execution',
          sourceId: 'card-1',
          status: 'pending',
          updatedAt: createdAt.toISOString(),
        },
        {
          action: 'approve_plan',
          queuedSequence: 1,
          runId: 'older-execution',
          sourceId: 'plan-1',
          status: 'completed',
          terminalSequence: 2,
          updatedAt: createdAt.toISOString(),
        },
      ];

      const reconciled = reconcileThreadWorkflowSnapshot(
        current,
        execution(status),
      );

      expect(reconciled.uiActionRuns?.[0]).toEqual({
        ...current.uiActionRuns[0],
        status: uiActionStatus,
        ...(error ? { error } : {}),
      });
      expect(reconciled.uiActionRuns?.[1]).toBe(current.uiActionRuns[1]);
      expect(current.uiActionRuns[0]?.status).toBe('pending');
    },
  );
  it('settles a pending ui-action from its own execution, and keeps a queued one pending', async () => {
    const current = snapshot();
    const state = (runId: string, sourceId: string) => ({
      action: 'approve_plan',
      queuedSequence: 2,
      runId,
      sourceId,
      status: 'pending' as const,
      updatedAt: createdAt.toISOString(),
    });
    current.uiActionRuns = [
      state('crashed-execution', 'plan-1'),
      state('queued-execution', 'plan-2'),
    ];
    const $queryRaw = vi
      .fn()
      .mockResolvedValueOnce([execution('RUNNING')])
      .mockResolvedValueOnce([
        { ...execution('FAILED'), id: 'crashed-execution' },
        { ...execution('PENDING'), id: 'queued-execution' },
      ]);

    const result = await readThreadWorkflowSnapshot(
      { $queryRaw } as unknown as Pick<PrismaService, '$queryRaw'>,
      current,
    );

    expect(result.uiActionRuns).toEqual([
      expect.objectContaining({
        error: 'The action failed before it finished.',
        runId: 'crashed-execution',
        status: 'failed',
      }),
      expect.objectContaining({ runId: 'queued-execution', status: 'pending' }),
    ]);
    const query = $queryRaw.mock.calls[1][0] as Prisma.Sql;
    expect(query.sql).toContain('"organizationId" = ?');
    expect(query.sql).toContain('"isDeleted" = false');
    expect(query.values).toEqual(
      expect.arrayContaining(['crashed-execution', 'queued-execution']),
    );
  });

  describe('lane ownership', () => {
    const running = { ...execution('RUNNING'), id: 'run-a' };
    const queued = {
      ...execution('PENDING'),
      createdAt: new Date('2026-09-08T10:01:00.000Z'),
      id: 'run-b',
    };
    function laneSnapshot() {
      const current = snapshot();
      current.activeRun = { runId: 'run-a', status: 'running' };
      current.uiActionRuns = ['run-a', 'run-b'].map((runId, index) => ({
        action: 'confirm_mutation',
        queuedSequence: index + 1,
        runId,
        sourceId: `card-${runId}`,
        status: 'pending' as const,
        updatedAt: createdAt.toISOString(),
      }));
      return current;
    }

    it('keeps the running run active while a newer run is queued behind it', async () => {
      const $queryRaw = vi
        .fn()
        .mockResolvedValueOnce([queued])
        .mockResolvedValueOnce([running]);

      const result = await readThreadWorkflowSnapshot(
        { $queryRaw } as unknown as Pick<PrismaService, '$queryRaw'>,
        laneSnapshot(),
      );

      expect(result.activeRun).toMatchObject({
        runId: 'run-a',
        status: 'running',
      });
      expect(($queryRaw.mock.calls[1][0] as Prisma.Sql).values).toEqual(
        expect.arrayContaining(['run-a']),
      );
      expect(result.uiActionRuns?.map((run) => run.status)).toEqual([
        'pending',
        'pending',
      ]);
    });

    it('hands the lane to the queued run once the owner’s execution ended', () => {
      const result = reconcileThreadWorkflowSnapshot(laneSnapshot(), queued, [
        { ...running, status: 'COMPLETED' },
      ]);

      expect(result.activeRun).toMatchObject({
        runId: 'run-b',
        status: 'running',
      });
      expect(result.uiActionRuns?.[0]).toMatchObject({
        runId: 'run-a',
        status: 'completed',
      });
    });

    it('lets a started run take over even when the owner recorded no end', () => {
      const result = reconcileThreadWorkflowSnapshot(
        laneSnapshot(),
        { ...queued, status: 'RUNNING' },
        [running],
      );

      expect(result.activeRun?.runId).toBe('run-b');
    });
  });

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
