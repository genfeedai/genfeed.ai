import {
  STALLED_ROLLUP_BACKFILL_WINDOW_MS,
  TASK_ROLLUP_LEASE_TTL_MS,
  TASK_ROLLUP_MAX_ATTEMPTS,
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
  rolledUpAt: Date | null;
  rollupAttempts: number;
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
    rolledUpAt: null,
    rollupAttempts: 0,
    rollupLeaseExpiresAt: null,
    rollupLeaseOwner: null,
    status: options.status ?? 'in_progress',
  };
  const events: string[] = [];
  let failFinalWrites = 0;

  const matches = (expected: Expected) =>
    task.status === expected.status &&
    (expected.rollupLeaseOwner === undefined ||
      task.rollupLeaseOwner === expected.rollupLeaseOwner);

  const isStalled = (maxAttempts: number) => {
    const isSettled = task.linkedExecutionIds.every((id) =>
      ['COMPLETED', 'FAILED', 'CANCELLED'].includes(
        options.executions[id]?.status ?? '',
      ),
    );
    const isFree =
      task.rollupLeaseExpiresAt === null || task.rollupLeaseExpiresAt <= now;
    return (
      task.status === 'in_progress' &&
      task.rolledUpAt === null &&
      task.rollupAttempts < maxAttempts &&
      isSettled &&
      isFree
    );
  };

  const tasksService = {
    acquireRollupLease: vi.fn(
      async (input: { maxAttempts: number; owner: string; ttlMs: number }) => {
        const isFree =
          task.rollupLeaseExpiresAt === null ||
          task.rollupLeaseExpiresAt <= now;
        if (
          task.status !== 'in_progress' ||
          task.rolledUpAt ||
          task.rollupAttempts >= input.maxAttempts ||
          !isFree
        ) {
          return null;
        }
        task.rollupAttempts += 1;
        task.rollupLeaseOwner = input.owner;
        task.rollupLeaseExpiresAt = new Date(now.getTime() + input.ttlMs);
        return task.rollupAttempts;
      },
    ),
    countStalledRollupCandidates: vi.fn(
      async (options: { maxAttempts: number }) =>
        isStalled(options.maxAttempts) ? 1 : 0,
    ),
    findOne: vi.fn(async () => structuredClone(task)),
    findStalledRollupCandidates: vi.fn(
      async (options: {
        createdAfter: Date;
        limit: number;
        maxAttempts: number;
        now: Date;
        settledBefore: Date;
      }) =>
        isStalled(options.maxAttempts)
          ? [{ id: task.id, organizationId: 'org-1' }]
          : [],
    ),
    recordTaskEventIfMatches: vi.fn(
      async (
        _id: string,
        _org: string,
        _user: string,
        event: { type: string },
        patch: Record<string, unknown> & { config?: object },
        expected: Expected,
      ) => {
        if (patch.status && failFinalWrites > 0) {
          failFinalWrites -= 1;
          throw new Error('database unavailable');
        }
        if (!matches(expected)) return null;
        const { config, ...columns } = patch;
        Object.assign(task, columns, config);
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
    /** A PATCH to in_progress, as the tasks controller allows. */
    reopen: () => {
      task.status = 'in_progress';
    },
    /** Linking a new cycle of executions, as linkAgentExecutions does. */
    relink: () => {
      task.rolledUpAt = null;
      task.rollupAttempts = 0;
    },
    failFinalWrites: (times: number) => {
      failFinalWrites = times;
    },
    logger,
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
      h.failFinalWrites(1);

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

  describe('attempt cap', () => {
    it('abandons a task whose final write keeps failing: logged once, then left alone', async () => {
      const h = makeHarness({ executions: { 'execution-1': completed } });
      h.failFinalWrites(10);

      await expect(
        h.service.handleExecutionCompletion('execution-1', 'org-1'),
      ).rejects.toThrow();
      for (let attempt = 2; attempt <= TASK_ROLLUP_MAX_ATTEMPTS; attempt += 1) {
        h.advance(TASK_ROLLUP_LEASE_TTL_MS);
        expect(await h.service.recoverStalledRollups()).toBe(0);
      }

      expect(h.task.rollupAttempts).toBe(TASK_ROLLUP_MAX_ATTEMPTS);
      expect(h.task.status).toBe('in_progress');
      expect(
        h.logger.error.mock.calls.filter(([message]) =>
          String(message).includes('abandoned'),
        ),
      ).toHaveLength(1);

      // Capped: neither the sweep nor a new event touches it again.
      h.advance(TASK_ROLLUP_LEASE_TTL_MS);
      h.failFinalWrites(0);
      expect(await h.service.recoverStalledRollups()).toBe(0);
      await h.service.handleExecutionCompletion('execution-1', 'org-1');
      expect(h.task.status).toBe('in_progress');
      expect(h.quality.assess).toHaveBeenCalledTimes(TASK_ROLLUP_MAX_ATTEMPTS);
      expect(
        h.logger.error.mock.calls.filter(([message]) =>
          String(message).includes('abandoned'),
        ),
      ).toHaveLength(1);
    });

    it('starts a fresh attempt budget when new executions are linked', async () => {
      const h = makeHarness({ executions: { 'execution-1': completed } });
      h.failFinalWrites(10);
      await h.service
        .handleExecutionCompletion('execution-1', 'org-1')
        .catch(() => null);
      for (let i = 1; i < TASK_ROLLUP_MAX_ATTEMPTS; i += 1) {
        h.advance(TASK_ROLLUP_LEASE_TTL_MS);
        await h.service.recoverStalledRollups();
      }
      h.advance(TASK_ROLLUP_LEASE_TTL_MS);
      expect(await h.service.recoverStalledRollups()).toBe(0);

      h.failFinalWrites(0);
      h.relink();

      expect(await h.service.recoverStalledRollups()).toBe(1);
      expect(h.task.status).toBe('in_review');
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

  describe('reopened task', () => {
    it('is not rolled up again from the previous cycle until new executions are linked', async () => {
      const h = makeHarness({ executions: { 'execution-1': completed } });
      await h.service.handleExecutionCompletion('execution-1', 'org-1');
      expect(h.task.status).toBe('in_review');
      expect(h.task.rolledUpAt).not.toBeNull();

      h.reopen();
      h.advance(TASK_ROLLUP_LEASE_TTL_MS);
      expect(await h.service.recoverStalledRollups()).toBe(0);
      await h.service.reconcileTerminalExecutions(['execution-1'], 'org-1');
      expect(h.task.status).toBe('in_progress');
      expect(h.quality.assess).toHaveBeenCalledOnce();

      h.relink();
      expect(await h.service.recoverStalledRollups()).toBe(1);
      expect(h.task.status).toBe('in_review');
      expect(h.quality.assess).toHaveBeenCalledTimes(2);
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

  it('logs how many tasks are eligible at the start of each sweep', async () => {
    const stalled = makeHarness({ executions: { 'execution-1': completed } });
    const running = makeHarness({
      executions: {
        'execution-1': { status: WorkflowExecutionStatus.RUNNING },
      },
    });

    await stalled.service.recoverStalledRollups();
    await running.service.recoverStalledRollups();

    expect(stalled.logger.log.mock.calls[0]?.[0]).toBe(
      'workspace-task-rollup-recovery: 1 eligible',
    );
    expect(running.logger.log.mock.calls[0]?.[0]).toBe(
      'workspace-task-rollup-recovery: 0 eligible',
    );
  });

  it('bounds the backfill to the last 7 days', () => {
    expect(STALLED_ROLLUP_BACKFILL_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('asks the sweep for settled tasks idle past the grace window', async () => {
    const h = makeHarness({ executions: { 'execution-1': completed } });

    await h.service.recoverStalledRollups();

    const [options] =
      h.tasksService.findStalledRollupCandidates.mock.calls[0] ?? [];
    expect(options?.now).toEqual(h.now());
    expect(options?.settledBefore.getTime()).toBeLessThan(h.now().getTime());
    expect(options?.createdAfter.getTime()).toBe(
      h.now().getTime() - STALLED_ROLLUP_BACKFILL_WINDOW_MS,
    );
    expect(options?.limit).toBe(25);
    expect(options?.maxAttempts).toBe(TASK_ROLLUP_MAX_ATTEMPTS);
  });
});
