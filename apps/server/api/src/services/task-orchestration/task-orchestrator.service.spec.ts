import {
  TASK_ROLLUP_LEASE_TTL_MS,
  TaskOrchestratorService,
} from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';

type StoredTask = {
  assigneeUserId: string;
  id: string;
  linkedExecutionIds: string[];
  outputType: string;
  platforms: string[];
  progress?: unknown;
  qualityAssessment?: unknown;
  request: string;
  rollupLeaseExpiresAt: Date | null;
  rollupLeaseOwner: string | null;
  status: string;
};

type Expected = { rollupLeaseOwner?: string; status: string };

/**
 * In-memory task store with the semantics of the real conditional writes:
 * the lease claim and `recordTaskEventIfMatches` only apply while the stored
 * row still matches, checked at write time.
 */
function makeHarness(options: {
  executions: Record<string, { metadata?: object; status: string }>;
  status?: string;
}) {
  let now = new Date('2026-10-05T12:00:00.000Z');
  const task: StoredTask = {
    assigneeUserId: 'user-1',
    id: 'task-1',
    linkedExecutionIds: Object.keys(options.executions),
    outputType: 'image',
    platforms: [],
    request: 'a green apple',
    rollupLeaseExpiresAt: null,
    rollupLeaseOwner: null,
    status: options.status ?? 'in_progress',
  };
  const events: string[] = [];
  let failNextFinalWrite = false;

  const matches = (expected: Expected) =>
    task.status === expected.status &&
    (expected.rollupLeaseOwner === undefined ||
      task.rollupLeaseOwner === expected.rollupLeaseOwner);

  const tasksService = {
    acquireRollupLease: vi.fn(
      async (_id: string, _org: string, owner: string, ttlMs: number) => {
        const isFree =
          task.rollupLeaseExpiresAt === null ||
          task.rollupLeaseExpiresAt <= now;
        if (task.status !== 'in_progress' || !isFree) return false;
        task.rollupLeaseOwner = owner;
        task.rollupLeaseExpiresAt = new Date(now.getTime() + ttlMs);
        return true;
      },
    ),
    findOne: vi.fn(async () => structuredClone(task)),
    findStalledRollupCandidates: vi.fn(
      async (_now: Date, _settledBefore: Date, _limit: number) => {
        const isSettled = task.linkedExecutionIds.every((id) =>
          ['COMPLETED', 'FAILED', 'CANCELLED'].includes(
            options.executions[id].status,
          ),
        );
        const isFree =
          task.rollupLeaseExpiresAt === null ||
          task.rollupLeaseExpiresAt <= now;
        return task.status === 'in_progress' && isSettled && isFree
          ? [{ id: task.id, organizationId: 'org-1' }]
          : [];
      },
    ),
    recordTaskEventIfMatches: vi.fn(
      async (
        _id: string,
        _org: string,
        _user: string,
        event: { type: string },
        patch: Record<string, unknown>,
        expected: Expected,
      ) => {
        if (patch.status && failNextFinalWrite) {
          failNextFinalWrite = false;
          throw new Error('database unavailable');
        }
        if (!matches(expected)) return null;
        Object.assign(task, patch);
        events.push(event.type);
        return structuredClone(task);
      },
    ),
  };
  const workflowExecutionsService = {
    findOne: vi.fn(async (where: { id: string }) => {
      const execution = options.executions[where.id];
      return execution ? { id: where.id, ...execution } : null;
    }),
  };
  const quality = {
    assess: vi.fn().mockResolvedValue({
      gate: 'pass',
      score: 90,
      suggestedFixes: [],
    }),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new TaskOrchestratorService(
    workflowExecutionsService as never,
    tasksService as never,
    quality as never,
    logger as never,
  );

  return {
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
      vi.setSystemTime(now);
    },
    events,
    failNextFinalWrite: () => {
      failNextFinalWrite = true;
    },
    now: () => now,
    quality,
    service,
    task,
    tasksService,
    workflowExecutionsService,
  };
}

const completed = { status: WorkflowExecutionStatus.COMPLETED };

describe('TaskOrchestratorService rollup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the task to review with its fields and releases the lease in one write', async () => {
    const h = makeHarness({ executions: { 'execution-1': completed } });

    await h.service.handleExecutionCompletion('execution-1', 'org-1');

    expect(h.task).toEqual(
      expect.objectContaining({
        qualityAssessment: expect.objectContaining({ gate: 'pass' }),
        rollupLeaseExpiresAt: null,
        rollupLeaseOwner: null,
        status: 'in_review',
      }),
    );
    expect(h.events).toEqual(['execution_completed', 'task_ready_for_review']);
  });

  it('records a failed rollup without running the paid assessment', async () => {
    const h = makeHarness({
      executions: { 'execution-1': { status: WorkflowExecutionStatus.FAILED } },
    });

    await h.service.handleExecutionCompletion('execution-1', 'org-1');

    expect(h.task.status).toBe('failed');
    expect(h.task.rollupLeaseOwner).toBeNull();
    expect(h.quality.assess).not.toHaveBeenCalled();
  });

  it('runs the paid assessment once when the listener, reconcile and sweep race', async () => {
    const h = makeHarness({ executions: { 'execution-1': completed } });

    await Promise.all([
      h.service.handleExecutionCompletion('execution-1', 'org-1'),
      h.service.reconcileTerminalExecutions(['execution-1'], 'org-1'),
      h.service.recoverStalledRollups(),
      h.service.handleExecutionCompletion('execution-1', 'org-1'),
    ]);

    expect(h.quality.assess).toHaveBeenCalledOnce();
    expect(
      h.events.filter((type) => type === 'task_ready_for_review'),
    ).toHaveLength(1);
    expect(h.task.status).toBe('in_review');
  });

  describe('failed final write', () => {
    it('keeps the task in progress under its lease, then the sweep finishes it after expiry', async () => {
      const h = makeHarness({ executions: { 'execution-1': completed } });
      h.failNextFinalWrite();

      await expect(
        h.service.handleExecutionCompletion('execution-1', 'org-1'),
      ).rejects.toThrow('database unavailable');

      // No final status without its fields: the task is still in progress.
      expect(h.task.status).toBe('in_progress');
      expect(h.task.qualityAssessment).toBeUndefined();
      expect(h.task.rollupLeaseOwner).not.toBeNull();

      // While the lease is live, neither a new event nor the sweep re-runs it.
      await h.service.handleExecutionCompletion('execution-1', 'org-1');
      expect(await h.service.recoverStalledRollups()).toBe(0);
      expect(h.quality.assess).toHaveBeenCalledOnce();

      h.advance(TASK_ROLLUP_LEASE_TTL_MS);
      expect(await h.service.recoverStalledRollups()).toBe(1);

      expect(h.task.status).toBe('in_review');
      expect(h.task.qualityAssessment).toEqual(
        expect.objectContaining({ gate: 'pass' }),
      );
      expect(h.task.rollupLeaseOwner).toBeNull();
    });
  });

  describe('lease expiry', () => {
    it('lets the sweep re-claim a dead holder and rejects that holder if it wakes up late', async () => {
      const h = makeHarness({ executions: { 'execution-1': completed } });
      let releaseFirstAssessment!: () => void;
      h.quality.assess.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstAssessment = () =>
              resolve({ gate: 'fail', score: 10, suggestedFixes: [] });
          }),
      );

      // Holder A claims the lease and stalls inside the assessment.
      const holderA = h.service.handleExecutionCompletion(
        'execution-1',
        'org-1',
      );
      await vi.waitFor(() => expect(h.quality.assess).toHaveBeenCalledOnce());
      const ownerA = h.task.rollupLeaseOwner;

      expect(await h.service.recoverStalledRollups()).toBe(0);

      h.advance(TASK_ROLLUP_LEASE_TTL_MS + 1);
      expect(await h.service.recoverStalledRollups()).toBe(1);
      expect(h.task.status).toBe('in_review');
      expect(h.task.qualityAssessment).toEqual(
        expect.objectContaining({ gate: 'pass' }),
      );

      // A finishes late: its final write names a lease it no longer holds.
      releaseFirstAssessment();
      await holderA;
      expect(ownerA).not.toBeNull();
      expect(h.task.qualityAssessment).toEqual(
        expect.objectContaining({ gate: 'pass' }),
      );
      expect(
        h.events.filter((type) => type === 'task_ready_for_review'),
      ).toHaveLength(1);
    });
  });

  describe('stale progress', () => {
    it('drops a progress write computed before another handler rolled the task up', async () => {
      const h = makeHarness({
        executions: { 'execution-1': completed, 'execution-2': completed },
      });
      const findExecution = h.workflowExecutionsService.findOne;
      let isRaced = false;
      // Handler A has read the task (in progress) and is computing progress
      // when handler B completes the whole rollup.
      findExecution.mockImplementation(async (where: { id: string }) => {
        if (!isRaced) {
          isRaced = true;
          await h.service.handleExecutionCompletion('execution-2', 'org-1');
        }
        return { id: where.id, ...completed };
      });

      await h.service.handleExecutionCompletion('execution-1', 'org-1');

      expect(h.task.status).toBe('in_review');
      expect(h.task.progress).toEqual(
        expect.objectContaining({ stage: 'review' }),
      );
      expect(h.events).toEqual([
        'execution_completed',
        'task_ready_for_review',
      ]);
      expect(h.quality.assess).toHaveBeenCalledOnce();
    });
  });

  describe('reconcileTerminalExecutions (finish-before-link)', () => {
    it('rolls up a task whose execution settled before it was linked', async () => {
      const h = makeHarness({ executions: { 'execution-1': completed } });

      await h.service.reconcileTerminalExecutions(['execution-1'], 'org-1');

      expect(h.task.status).toBe('in_review');
    });

    it('leaves the task in progress while another execution still runs', async () => {
      const h = makeHarness({
        executions: {
          'execution-1': completed,
          'execution-2': { status: WorkflowExecutionStatus.RUNNING },
        },
      });

      await h.service.reconcileTerminalExecutions(
        ['execution-1', 'execution-2'],
        'org-1',
      );

      expect(h.task.status).toBe('in_progress');
      expect(h.events).toEqual(['execution_completed']);
      expect(h.tasksService.acquireRollupLease).not.toHaveBeenCalled();
    });
  });

  it('ignores events for a task that already left in_progress', async () => {
    const h = makeHarness({
      executions: { 'execution-1': completed },
      status: 'in_review',
    });

    await h.service.handleExecutionCompletion('execution-1', 'org-1');

    expect(h.tasksService.recordTaskEventIfMatches).not.toHaveBeenCalled();
    expect(h.quality.assess).not.toHaveBeenCalled();
  });

  it('asks the sweep for settled tasks idle past the grace window', async () => {
    const h = makeHarness({ executions: { 'execution-1': completed } });

    await h.service.recoverStalledRollups();

    const [now, settledBefore, limit] =
      h.tasksService.findStalledRollupCandidates.mock.calls[0] ?? [];
    expect(now).toEqual(h.now());
    expect(settledBefore?.getTime()).toBeLessThan(h.now().getTime());
    expect(limit).toBeGreaterThan(0);
  });
});
