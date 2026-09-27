import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE_SIZE = 200;

interface FakeRow {
  id: string;
  organizationId: string;
  createdAt: Date;
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
      .map(({ id, organizationId, createdAt }) => ({
        id,
        organizationId,
        createdAt,
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
  const queueService = { hasClaimableSystemWorkflowJob: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn() };
  let service: PendingWorkflowExecutionReconcileService;

  beforeEach(() => {
    vi.clearAllMocks();
    staleExecutionFinder = new FakeStaleExecutionFinder();
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
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

    it('never starves an earlier live-job row even while 200+ new candidates keep arriving every tick', async () => {
      const now = Date.now();
      const orphan: FakeRow = {
        id: 'orphan',
        organizationId: 'org-1',
        createdAt: new Date(now - 50 * 60_000),
      };
      // 199 more rows, all newer than `orphan` but still older than the
      // 5-minute staleness bound, all permanently retaining a live job.
      const fillers = buildRows(
        PAGE_SIZE - 1,
        'filler',
        new Date(now - 10 * 60_000),
      );
      staleExecutionFinder.seed([orphan, ...fillers]);
      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) => jobId !== `system-workflow-${orphan.id}`,
      );

      // Sweep 1: lap 1 starts, boundary snapshot = the newest filler row.
      // Page 1 is a full page of exactly 200 (orphan + 199 fillers) — the
      // lap continues. `orphan` is examined here and found to have no live
      // job, so it is recovered immediately.
      await service.reconcile();
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        orphan.id,
        expect.stringContaining('no worker ever picked it up'),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
      // The very first page already carried the lap's boundary snapshot —
      // captured via `findUpperBoundary` before this page was fetched.
      const lap1Options = staleExecutionFinder.findMany.mock.calls[0][2];
      expect(lap1Options?.cursor).toBeUndefined();
      expect(lap1Options?.upperBoundary).toEqual({
        createdAt: fillers[fillers.length - 1].createdAt,
        id: fillers[fillers.length - 1].id,
      });

      // Between every subsequent tick, 250 brand-new candidates arrive —
      // more than a full page, so if the lap were not capped to its
      // original boundary, every later page would come back full forever
      // and the lap would never reset.
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

      // The lap must have completed (reset) despite the continuous
      // arrivals: findUpperBoundary was called again for a fresh lap.
      expect(
        staleExecutionFinder.findUpperBoundary.mock.calls.length,
      ).toBeGreaterThan(1);
      // orphan was only ever recovered once, in the very first sweep.
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
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

    it('processes two rows sharing the exact same createdAt exactly once each across a page boundary', async () => {
      const now = Date.now();
      // Safely past the 5-minute staleness bound (unlike `now - 5 * 60_000`,
      // which would land exactly on the exclusive `staleBefore` edge and
      // never match) but newer than every filler.
      const tiedCreatedAt = new Date(now - 6 * 60_000);
      const fillers = buildRows(
        PAGE_SIZE,
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

      // Sweep 1: page 1 is the 200 fillers (full — lap continues). Neither
      // tied row has been examined yet.
      await service.reconcile();
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalledWith(
        'tied-a',
        expect.anything(),
      );
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalledWith(
        'tied-b',
        expect.anything(),
      );

      // Sweep 2: page 2 is exactly the two tied rows (short — lap resets).
      // The id tiebreaker must place both after the cursor and at or before
      // the boundary — neither skipped, neither repeated.
      await service.reconcile();

      expect(queueService.hasClaimableSystemWorkflowJob).toHaveBeenCalledWith(
        'system-workflow-tied-a',
      );
      expect(queueService.hasClaimableSystemWorkflowJob).toHaveBeenCalledWith(
        'system-workflow-tied-b',
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'tied-a',
        expect.any(String),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'tied-b',
        expect.any(String),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(2);
    });

    it('applies the same boundary-snapshot bounding to the ancient cohort', async () => {
      const now = Date.now();
      const ancientOrphan: FakeRow = {
        id: 'ancient-orphan',
        organizationId: 'org-1',
        createdAt: new Date(now - 48 * 60 * 60_000),
      };
      const ancientFillers = buildRows(
        PAGE_SIZE - 1,
        'ancient-filler',
        new Date(now - 25 * 60 * 60_000),
      );
      staleExecutionFinder.seed([ancientOrphan, ...ancientFillers]);
      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) =>
          jobId !== `system-workflow-${ancientOrphan.id}`,
      );

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        ancientOrphan.id,
      );
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(1);

      // New arrivals afterward — newer than the existing ancient fillers,
      // i.e. only just old enough to qualify as ancient — must not
      // re-trigger a duplicate cancel for the same row, nor prevent the lap
      // from resetting.
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
