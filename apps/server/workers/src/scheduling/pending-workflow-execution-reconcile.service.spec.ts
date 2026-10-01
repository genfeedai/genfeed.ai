import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE_SIZE = 200;

interface FakeRow {
  id: string;
  organizationId: string;
  createdAt: Date;
  cancelRequestedAt?: Date | null;
}

interface FakeQueryOptions {
  limit?: number;
  cursor?: { createdAt: Date; id: string };
  upperBoundary?: { createdAt: Date; id: string };
}

function tupleCompare(
  a: { createdAt: Date; id: string },
  b: { createdAt: Date; id: string },
): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

/**
 * A query-aware fake for `StalePendingSystemExecutionFinderService`: it
 * actually applies the cohort's date range, the `cursor`/`upperBoundary`
 * keyset filters, ordering, and `take` against an in-memory row set, instead
 * of returning whatever a test pre-scripted regardless of the arguments
 * (#5319 second review). Tests mutate `rows` directly (add/remove) to model
 * new candidates arriving or a row transitioning out of PENDING between
 * ticks.
 */
class FakeStaleExecutionFinder {
  readonly rows = new Map<string, FakeRow>();

  seed(rows: FakeRow[]): void {
    for (const row of rows) this.rows.set(row.id, row);
  }

  private matching(predicate: (row: FakeRow) => boolean): FakeRow[] {
    return [...this.rows.values()]
      .filter(predicate)
      .sort(tupleCompare)
      .map(({ id, organizationId, createdAt, cancelRequestedAt }) => ({
        id,
        organizationId,
        createdAt,
        cancelRequestedAt: cancelRequestedAt ?? null,
      }));
  }

  private page(matches: FakeRow[], options: FakeQueryOptions): FakeRow[] {
    const { cursor, upperBoundary, limit = 200 } = options;
    let filtered = matches;
    if (cursor) {
      filtered = filtered.filter((row) => tupleCompare(row, cursor) > 0);
    }
    if (upperBoundary) {
      filtered = filtered.filter(
        (row) => tupleCompare(row, upperBoundary) <= 0,
      );
    }
    return filtered.slice(0, limit);
  }

  findMany = vi.fn(
    async (
      staleBefore: Date,
      createdAfter: Date,
      options: FakeQueryOptions = {},
    ): Promise<FakeRow[]> => {
      const matches = this.matching(
        (row) => row.createdAt >= createdAfter && row.createdAt < staleBefore,
      );
      return this.page(matches, options);
    },
  );

  findManyAncient = vi.fn(
    async (
      createdBefore: Date,
      options: FakeQueryOptions = {},
    ): Promise<FakeRow[]> => {
      const matches = this.matching((row) => row.createdAt < createdBefore);
      return this.page(matches, options);
    },
  );

  findUpperBoundary = vi.fn(
    async (
      staleBefore: Date,
      createdAfter: Date,
    ): Promise<{ createdAt: Date; id: string } | undefined> => {
      const matches = this.matching(
        (row) => row.createdAt >= createdAfter && row.createdAt < staleBefore,
      );
      const last = matches[matches.length - 1];
      return last ? { createdAt: last.createdAt, id: last.id } : undefined;
    },
  );

  /** Rows flagged `isAgentTurn` model `INTERACTIVE` agent-conversation runs. */
  readonly agentTurnIds = new Set<string>();

  findStalledInteractiveAgentTurns = vi.fn(
    async (
      createdBefore: Date,
      createdAfter: Date,
      limit: number,
    ): Promise<FakeRow[]> =>
      this.matching(
        (row) =>
          this.agentTurnIds.has(row.id) &&
          !row.cancelRequestedAt &&
          row.createdAt >= createdAfter &&
          row.createdAt < createdBefore,
      ).slice(0, limit),
  );

  findUpperBoundaryAncient = vi.fn(
    async (
      createdBefore: Date,
    ): Promise<{ createdAt: Date; id: string } | undefined> => {
      const matches = this.matching((row) => row.createdAt < createdBefore);
      const last = matches[matches.length - 1];
      return last ? { createdAt: last.createdAt, id: last.id } : undefined;
    },
  );
}

/** Builds `count` rows, evenly spaced one second apart, ending at `endingAt`. */
function buildRows(
  count: number,
  prefix: string,
  endingAt: Date,
  organizationId = 'org-1',
): FakeRow[] {
  const endMs = endingAt.getTime();
  return Array.from({ length: count }, (_, index) => ({
    createdAt: new Date(endMs - (count - 1 - index) * 1000),
    id: `${prefix}-${String(index).padStart(4, '0')}`,
    organizationId,
  }));
}

describe('PendingWorkflowExecutionReconcileService', () => {
  const workflowExecutions = {
    cancelExecution: vi.fn(),
    completeExecution: vi.fn(),
  };
  let staleExecutionFinder: FakeStaleExecutionFinder;
  const queueService = {
    hasClaimableSystemWorkflowJob: vi.fn(),
    withdrawUnstartedSystemWorkflowJob: vi.fn(),
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  let service: PendingWorkflowExecutionReconcileService;

  beforeEach(() => {
    vi.clearAllMocks();
    staleExecutionFinder = new FakeStaleExecutionFinder();
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
    queueService.withdrawUnstartedSystemWorkflowJob.mockResolvedValue('absent');
    // A successful transition removes the row from the fake's PENDING set,
    // mirroring production: once `status` leaves PENDING, the finder's own
    // `status: PENDING` filter naturally excludes it from every later query
    // — no test needs to model that separately.
    workflowExecutions.completeExecution.mockImplementation(
      async (executionId: string) => {
        staleExecutionFinder.rows.delete(executionId);
        return { id: executionId, status: 'FAILED' };
      },
    );
    workflowExecutions.cancelExecution.mockImplementation(
      async (executionId: string) => {
        staleExecutionFinder.rows.delete(executionId);
        return { status: 'CANCELLED' };
      },
    );
    // A fresh service per test: lap state (boundary/cursor) is instance
    // state, and several scenarios below deliberately span multiple calls
    // to `reconcile()` within a single test.
    service = new PendingWorkflowExecutionReconcileService(
      workflowExecutions as never,
      staleExecutionFinder as never,
      queueService as never,
      logger as never,
    );
  });

  it('does nothing when there are no stale pending executions', async () => {
    await service.reconcile();
    expect(queueService.hasClaimableSystemWorkflowJob).not.toHaveBeenCalled();
    expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
  });

  it('fails a stale execution with no live BullMQ job (#5162)', async () => {
    staleExecutionFinder.seed([
      {
        id: 'execution-1',
        organizationId: 'org-1',
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    ]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

    await service.reconcile();

    expect(queueService.hasClaimableSystemWorkflowJob).toHaveBeenCalledWith(
      'system-workflow-execution-1',
    );
    expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.stringContaining('no worker ever picked it up'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('never-claimed'),
      expect.objectContaining({
        executionId: 'execution-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('leaves an execution alone when its job is still claimable — merely slow, not stuck', async () => {
    staleExecutionFinder.seed([
      {
        id: 'execution-2',
        organizationId: 'org-1',
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
    ]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

    await service.reconcile();

    expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
  });

  it('keeps reconciling remaining candidates when one fails', async () => {
    const now = Date.now();
    staleExecutionFinder.seed([
      {
        id: 'execution-3',
        organizationId: 'org-1',
        createdAt: new Date(now - 10 * 60_000),
      },
      {
        id: 'execution-4',
        organizationId: 'org-2',
        createdAt: new Date(now - 9 * 60_000),
      },
    ]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
    workflowExecutions.completeExecution
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValueOnce({ id: 'execution-4', status: 'FAILED' });

    await service.reconcile();

    expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to reconcile'),
      expect.objectContaining({ executionId: 'execution-3' }),
    );
  });

  describe('unstarted interactive agent turns (#5622)', () => {
    function seedTurn(id: string, ageMs: number): void {
      staleExecutionFinder.seed([
        {
          createdAt: new Date(Date.now() - ageMs),
          id,
          organizationId: 'org-1',
        },
      ]);
      staleExecutionFinder.agentTurnIds.add(id);
    }

    it('withdraws the job and fails a turn that is still waiting 2+ minutes after acceptance, even though its job is claimable', async () => {
      seedTurn('turn-waiting', 3 * 60_000);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);
      queueService.withdrawUnstartedSystemWorkflowJob.mockResolvedValue(
        'removed',
      );

      await service.reconcile();

      expect(
        queueService.withdrawUnstartedSystemWorkflowJob,
      ).toHaveBeenCalledWith('system-workflow-turn-waiting');
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'turn-waiting',
        expect.stringContaining('never started'),
      );
    });

    it('leaves a turn alone once a worker has started its job', async () => {
      seedTurn('turn-running', 3 * 60_000);
      queueService.withdrawUnstartedSystemWorkflowJob.mockResolvedValue(
        'started',
      );

      await service.reconcile();

      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    });

    it('does not touch a turn younger than the 2 minute start deadline', async () => {
      seedTurn('turn-fresh', 60_000);

      await service.reconcile();

      expect(
        queueService.withdrawUnstartedSystemWorkflowJob,
      ).not.toHaveBeenCalled();
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    });

    it('fails a turn whose job is already gone', async () => {
      seedTurn('turn-orphaned', 3 * 60_000);
      queueService.withdrawUnstartedSystemWorkflowJob.mockResolvedValue(
        'absent',
      );

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'turn-orphaned',
        expect.any(String),
      );
    });

    it('surfaces a stuck turn even when 200+ unrelated older PENDING runs with live jobs fill the generic sweep', async () => {
      staleExecutionFinder.seed(
        buildRows(
          PAGE_SIZE + 50,
          'backlog',
          new Date(Date.now() - 3 * 3600_000),
        ),
      );
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);
      seedTurn('turn-behind-backlog', 4 * 60_000);
      queueService.withdrawUnstartedSystemWorkflowJob.mockResolvedValue(
        'removed',
      );

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'turn-behind-backlog',
        expect.any(String),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
    });

    it('keeps sweeping the generic cohorts when the agent-turn query throws', async () => {
      staleExecutionFinder.findStalledInteractiveAgentTurns.mockRejectedValueOnce(
        new Error('db down'),
      );
      staleExecutionFinder.seed([
        {
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'generic-1',
          organizationId: 'org-1',
        },
      ]);

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'generic-1',
        expect.stringContaining('no worker ever picked it up'),
      );
    });
  });

  describe('thread status for runs ended through their execution (#5636)', () => {
    const recoveryEvents = { recordExecutionEnded: vi.fn() };
    let recoveringService: PendingWorkflowExecutionReconcileService;

    beforeEach(() => {
      recoveryEvents.recordExecutionEnded
        .mockReset()
        .mockResolvedValue(undefined);
      recoveringService = new PendingWorkflowExecutionReconcileService(
        workflowExecutions as never,
        staleExecutionFinder as never,
        queueService as never,
        logger as never,
        recoveryEvents as never,
      );
    });

    const calledBefore = (first: unknown, second: unknown) =>
      (first as { mock: { invocationCallOrder: number[] } }).mock
        .invocationCallOrder[0] <
      (second as { mock: { invocationCallOrder: number[] } }).mock
        .invocationCallOrder[0];

    it('records the failed run before closing an agent turn that never started', async () => {
      staleExecutionFinder.seed([
        {
          createdAt: new Date(Date.now() - 3 * 60_000),
          id: 'turn-stuck',
          organizationId: 'org-1',
        },
      ]);
      staleExecutionFinder.agentTurnIds.add('turn-stuck');

      await recoveringService.reconcile();

      expect(recoveryEvents.recordExecutionEnded).toHaveBeenCalledWith(
        'turn-stuck',
        { error: expect.stringContaining('never started'), type: 'failed' },
      );
      // After the execution is terminal the event no longer moves the derived
      // status, so the order is what makes the push fire.
      expect(
        calledBefore(
          recoveryEvents.recordExecutionEnded,
          workflowExecutions.completeExecution,
        ),
      ).toBe(true);
    });

    it('records the failed run before failing a never-claimed execution', async () => {
      staleExecutionFinder.seed([
        {
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'execution-unclaimed',
          organizationId: 'org-1',
        },
      ]);

      await recoveringService.reconcile();

      expect(recoveryEvents.recordExecutionEnded).toHaveBeenCalledWith(
        'execution-unclaimed',
        {
          error: expect.stringContaining('no worker ever picked it up'),
          type: 'failed',
        },
      );
      expect(
        calledBefore(
          recoveryEvents.recordExecutionEnded,
          workflowExecutions.completeExecution,
        ),
      ).toBe(true);
    });

    it('records a cancelled run before cancelling a drained execution', async () => {
      staleExecutionFinder.seed([
        {
          cancelRequestedAt: new Date(Date.now() - 6 * 60_000),
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'execution-drained',
          organizationId: 'org-1',
        },
      ]);

      await recoveringService.reconcile();

      expect(recoveryEvents.recordExecutionEnded).toHaveBeenCalledWith(
        'execution-drained',
        { type: 'cancelled' },
      );
      expect(
        calledBefore(
          recoveryEvents.recordExecutionEnded,
          workflowExecutions.cancelExecution,
        ),
      ).toBe(true);
    });

    it('records a cancelled run before silently cancelling an ancient execution', async () => {
      staleExecutionFinder.seed([
        {
          createdAt: new Date(Date.now() - 25 * 60 * 60_000),
          id: 'execution-ancient',
          organizationId: 'org-1',
        },
      ]);

      await recoveringService.reconcile();

      expect(recoveryEvents.recordExecutionEnded).toHaveBeenCalledWith(
        'execution-ancient',
        { type: 'cancelled' },
      );
      expect(
        calledBefore(
          recoveryEvents.recordExecutionEnded,
          workflowExecutions.cancelExecution,
        ),
      ).toBe(true);
      // Still silent: no loud failure and no error log.
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('records nothing for a turn a worker has already started', async () => {
      staleExecutionFinder.seed([
        {
          createdAt: new Date(Date.now() - 5 * 60_000),
          id: 'turn-running',
          organizationId: 'org-1',
        },
      ]);
      staleExecutionFinder.agentTurnIds.add('turn-running');
      queueService.withdrawUnstartedSystemWorkflowJob.mockResolvedValue(
        'started',
      );
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      await recoveringService.reconcile();

      expect(recoveryEvents.recordExecutionEnded).not.toHaveBeenCalled();
    });
  });

  describe('drain cancellation intent (#5450)', () => {
    it('silently cancels a recent execution whose drain cancellation intent was persisted, instead of failing it', async () => {
      staleExecutionFinder.seed([
        {
          cancelRequestedAt: new Date(Date.now() - 6 * 60_000),
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'execution-drained',
          organizationId: 'org-1',
        },
      ]);

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'execution-drained',
      );
      // completeExecution is the loud-failure path: it records the run and
      // can push a strategy already at 2 failures over the disable threshold.
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('still fails a recent execution with no cancellation intent (#5162 unchanged)', async () => {
      staleExecutionFinder.seed([
        {
          cancelRequestedAt: null,
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'execution-never-claimed',
          organizationId: 'org-1',
        },
      ]);

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledOnce();
      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
    });

    it('keeps the intent and never fails the run while the database stays down, then clears it once cancellation succeeds', async () => {
      staleExecutionFinder.seed([
        {
          cancelRequestedAt: new Date(Date.now() - 6 * 60_000),
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'execution-drained-retry',
          organizationId: 'org-1',
        },
      ]);
      workflowExecutions.cancelExecution.mockRejectedValueOnce(
        new Error('db unavailable'),
      );

      await service.reconcile();

      // The row is still PENDING with its intent, so the next lap retries it.
      expect(staleExecutionFinder.rows.has('execution-drained-retry')).toBe(
        true,
      );
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(2);
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
      expect(staleExecutionFinder.rows.has('execution-drained-retry')).toBe(
        false,
      );

      // Idempotent: the row left PENDING, so a further pass does nothing.
      await service.reconcile();
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(2);
    });

    it('leaves an intent-marked execution alone when its job is somehow claimable again', async () => {
      staleExecutionFinder.seed([
        {
          cancelRequestedAt: new Date(Date.now() - 6 * 60_000),
          createdAt: new Date(Date.now() - 10 * 60_000),
          id: 'execution-drain-race',
          organizationId: 'org-1',
        },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    });
  });

  describe('ancient (>24h) candidates (#5252 review)', () => {
    it('silently cancels an ancient never-claimed execution instead of failing it loudly', async () => {
      staleExecutionFinder.seed([
        {
          id: 'execution-ancient-1',
          organizationId: 'org-1',
          createdAt: new Date(Date.now() - 25 * 60 * 60_000),
        },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'execution-ancient-1',
      );
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('silently cancelled'),
        expect.objectContaining({ executionId: 'execution-ancient-1' }),
      );
      // No error-level "surfaced" log — that would be a customer-visible signal.
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('leaves an ancient execution alone when its job is still somehow claimable', async () => {
      staleExecutionFinder.seed([
        {
          id: 'execution-ancient-2',
          organizationId: 'org-1',
          createdAt: new Date(Date.now() - 25 * 60 * 60_000),
        },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
    });

    it('processes recent and ancient cohorts in the same reconcile pass', async () => {
      const now = Date.now();
      staleExecutionFinder.seed([
        {
          id: 'execution-recent',
          organizationId: 'org-1',
          createdAt: new Date(now - 10 * 60_000),
        },
        {
          id: 'execution-old',
          organizationId: 'org-1',
          createdAt: new Date(now - 25 * 60 * 60_000),
        },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'execution-recent',
        expect.any(String),
      );
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'execution-old',
      );
    });

    it('keeps reconciling remaining ancient candidates when one fails', async () => {
      const now = Date.now();
      staleExecutionFinder.seed([
        // Ascending (createdAt, id) order processes the older row first —
        // seed ages so execution-ancient-3 is examined before -4, matching
        // the reject-then-resolve mock sequence below.
        {
          id: 'execution-ancient-3',
          organizationId: 'org-1',
          createdAt: new Date(now - 26 * 60 * 60_000),
        },
        {
          id: 'execution-ancient-4',
          organizationId: 'org-2',
          createdAt: new Date(now - 25 * 60 * 60_000),
        },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
      workflowExecutions.cancelExecution
        .mockRejectedValueOnce(new Error('db unavailable'))
        .mockResolvedValueOnce({ status: 'CANCELLED' });

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to reconcile'),
        expect.objectContaining({ executionId: 'execution-ancient-3' }),
      );
    });
  });

  describe('lap boundary snapshot and starvation avoidance (#5319, second review)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('examines a candidate beyond the first page within a bounded number of sweeps even when every earlier row keeps a live job', async () => {
      const now = Date.now();
      const staleEnough = new Date(now - 10 * 60_000); // well past the 5-minute threshold
      // Exactly one page's worth of rows, all starting out with a live job.
      // `rows[0]` (the oldest) is the one whose job later disappears.
      const rows = buildRows(PAGE_SIZE, 'live', staleEnough);
      staleExecutionFinder.seed(rows);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      // Sweep 1: a full page (all 200), all skipped — none transition.
      await service.reconcile();
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
      expect(staleExecutionFinder.findMany).toHaveBeenCalledTimes(1);

      // Sweep 2: the lap's boundary was the last of those 200 rows, so this
      // page is empty (nothing left inside the lap) — the lap resets.
      await service.reconcile();
      expect(staleExecutionFinder.findUpperBoundary).toHaveBeenCalledTimes(1); // not called again yet
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();

      // Between sweeps 2 and 3, the row's job finally disappears, and a
      // fresh lap starts (a new boundary is captured, now including these
      // same still-PENDING rows again).
      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) => jobId !== `system-workflow-${rows[0].id}`,
      );

      await service.reconcile();

      expect(staleExecutionFinder.findUpperBoundary).toHaveBeenCalledTimes(2);
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        rows[0].id,
        expect.stringContaining('no worker ever picked it up'),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
    });

    it('recovers an early row once its job disappears after its first examination, despite 200+ new candidates arriving every tick', async () => {
      const now = Date.now();
      // `orphan` is the oldest row, so it is examined on sweep 1 — but it
      // still has a live job at that point (see below), so it is only
      // *skipped*, not recovered, on its first examination. Recovering it
      // trivially on sweep 1 (as an earlier version of this test did by
      // giving it no live job from the start) would pass even without any
      // pagination fix, since sweep 1 always reaches the front of the
      // cohort regardless of cursor/boundary handling.
      const orphan: FakeRow = {
        id: 'orphan',
        organizationId: 'org-1',
        createdAt: new Date(now - 50 * 60_000),
      };
      // 199 more rows, all newer than `orphan` but still older than the
      // 5-minute staleness bound, all permanently retaining a live job —
      // together with `orphan` this fills lap 1's only page exactly.
      const fillers = buildRows(
        PAGE_SIZE - 1,
        'filler',
        new Date(now - 10 * 60_000),
      );
      staleExecutionFinder.seed([orphan, ...fillers]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      // Sweep 1: lap 1's only page (orphan + 199 fillers, exactly 200 —
      // full, so the lap continues). Everything, including `orphan`, still
      // has a live job: nothing recovers yet.
      await service.reconcile();
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();

      // Only *after* that first examination does orphan's job disappear.
      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) => jobId !== `system-workflow-${orphan.id}`,
      );

      // Each subsequent tick, 250 brand-new candidates arrive — all dated
      // strictly after (newer than) every row already seeded, i.e. strictly
      // beyond the current lap's cursor/boundary. If the lap were not capped
      // to its original boundary, every later page would come back full of
      // these arrivals forever, the lap would never reset, and `orphan` —
      // already behind the cursor from sweep 1 — would never be examined
      // again even though it is now genuinely orphaned.
      for (let tick = 0; tick < 5; tick++) {
        vi.setSystemTime(new Date(Date.now() + 60_000));
        const arrivals = buildRows(
          250,
          `arrival-${tick}`,
          new Date(Date.now() - 10 * 60_000),
        );
        staleExecutionFinder.seed(arrivals);
        await service.reconcile();
      }

      // orphan is eventually recovered exactly once, via the age-appropriate
      // recent (loud) path — it is still well within the 24h window, so a
      // silent ancient cancellation would be the wrong action.
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        orphan.id,
        expect.stringContaining('no worker ever picked it up'),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
    });

    it('keeps the lap boundary fixed across ticks while the date bounds keep advancing with the clock', async () => {
      const now = Date.now();
      const rows = buildRows(250, 'recent', new Date(now - 10 * 60_000));
      staleExecutionFinder.seed(rows);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true); // nothing transitions — purely a pagination probe

      await service.reconcile(); // tick 1: page 1 of 200 (full — lap continues)
      const [staleBefore1, createdAfter1, options1] =
        staleExecutionFinder.findMany.mock.calls[0];

      vi.setSystemTime(new Date(Date.now() + 5 * 60_000));
      await service.reconcile(); // tick 2: page 2 of 50 (short — lap resets)
      const [staleBefore2, createdAfter2, options2] =
        staleExecutionFinder.findMany.mock.calls[1];

      // The date bounds moved forward with the clock, exactly as before
      // this fix — a row's recent-vs-ancient classification always reflects
      // its current age.
      expect(staleBefore2.getTime()).toBeGreaterThan(staleBefore1.getTime());
      expect(createdAfter2.getTime()).toBeGreaterThan(createdAfter1.getTime());
      // But the lap's boundary snapshot did not move.
      expect(options2?.upperBoundary).toEqual(options1?.upperBoundary);
      // And the cursor advanced past page 1's last row.
      expect(options2?.cursor).toEqual({
        createdAt: rows[199].createdAt,
        id: rows[199].id,
      });
    });

    it('processes two rows sharing the exact same createdAt exactly once each, straddling a page boundary', async () => {
      const now = Date.now();
      // Safely past the 5-minute staleness bound (unlike `now - 5 * 60_000`,
      // which would land exactly on the exclusive `staleBefore` edge and
      // never match) but newer than every filler.
      const tiedCreatedAt = new Date(now - 6 * 60_000);
      // 199 fillers + tied-a fill page 1 exactly (200); tied-b is the sole
      // row of page 2. The tie straddles the page boundary instead of both
      // rows landing together on the same page, which is the scenario that
      // actually exercises the id tiebreaker at the edge of a page.
      const fillers = buildRows(
        PAGE_SIZE - 1,
        'filler',
        new Date(now - 10 * 60_000),
      );
      const tiedA: FakeRow = {
        id: 'tied-a',
        organizationId: 'org-1',
        createdAt: tiedCreatedAt,
      };
      const tiedB: FakeRow = {
        id: 'tied-b',
        organizationId: 'org-1',
        createdAt: tiedCreatedAt,
      };
      staleExecutionFinder.seed([...fillers, tiedA, tiedB]);
      // Fillers keep a live job (skipped, stay pending, fill out page 1);
      // only the two tied rows have none (recovered once finally examined).
      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) =>
          jobId !== 'system-workflow-tied-a' &&
          jobId !== 'system-workflow-tied-b',
      );

      // Sweep 1: page 1 is 199 fillers + tied-a (full — lap continues).
      // tied-a, sharing tied-b's createdAt but sorting first by id, is
      // examined and recovered here; tied-b is not reached yet.
      await service.reconcile();
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'tied-a',
        expect.any(String),
      );
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalledWith(
        'tied-b',
        expect.anything(),
      );

      // Sweep 2: page 2 is exactly tied-b (short — lap resets). The id
      // tiebreaker must place it strictly after tied-a's cursor position —
      // neither skipped, nor repeated alongside tied-a.
      await service.reconcile();

      expect(queueService.hasClaimableSystemWorkflowJob).toHaveBeenCalledWith(
        'system-workflow-tied-a',
      );
      expect(queueService.hasClaimableSystemWorkflowJob).toHaveBeenCalledWith(
        'system-workflow-tied-b',
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'tied-b',
        expect.any(String),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(2);

      // A further lap (everything remaining is just the still-live fillers)
      // must not re-recover either tied row — both already transitioned out
      // of PENDING and were removed from the fake's dataset.
      await service.reconcile();
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(2);
    });

    it('recovers an ancient orphan beyond the first page within a bounded number of sweeps, via the silent cancel path', async () => {
      const now = Date.now();
      // 200 persistent live-job rows occupy lap 1's entire first page;
      // `ancientOrphan`, newer than all of them (so it sorts after them),
      // sits at row 201 and is not reached until sweep 2. Placing it first
      // (as an earlier version of this test did) would recover it on sweep
      // 1 regardless of whether pagination works at all — sweep 1 always
      // reaches the front of the cohort.
      const ancientFillers = buildRows(
        PAGE_SIZE,
        'ancient-filler',
        new Date(now - 30 * 60 * 60_000),
      );
      const ancientOrphan: FakeRow = {
        id: 'ancient-orphan',
        organizationId: 'org-1',
        createdAt: new Date(now - 25 * 60 * 60_000),
      };
      staleExecutionFinder.seed([...ancientFillers, ancientOrphan]);
      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) =>
          jobId !== `system-workflow-${ancientOrphan.id}`,
      );

      // Sweep 1: page 1 is the 200 persistent-live-job fillers (full — lap
      // continues). ancientOrphan, at row 201, is not examined yet.
      await service.reconcile();
      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();

      // Sweep 2: page 2 is just ancientOrphan (short — lap resets). It has
      // no live job, so it is silently cancelled — the age-appropriate
      // action for a row this old.
      await service.reconcile();
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        ancientOrphan.id,
      );
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(1);
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();

      // New arrivals afterward — newer than the existing ancient fillers,
      // i.e. only just old enough to qualify as ancient — must not
      // re-trigger a duplicate cancel for the same row, nor prevent the next
      // lap from starting cleanly.
      const moreAncientRows = buildRows(
        250,
        'ancient-arrival',
        new Date(now - 24 * 60 * 60_000 - 5 * 60_000),
      );
      staleExecutionFinder.seed(moreAncientRows);
      vi.setSystemTime(new Date(Date.now() + 60_000));
      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(1);
    });
  });
});
