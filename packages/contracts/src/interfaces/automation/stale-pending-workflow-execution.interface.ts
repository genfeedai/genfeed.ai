/**
 * A `PENDING` system-workflow execution row returned by
 * `StalePendingSystemExecutionFinderService` for
 * `PendingWorkflowExecutionReconcileService` to check for a live BullMQ job
 * and, if none exists, recover (#5162, #5319).
 */
export interface StalePendingSystemExecutionCandidate {
  id: string;
  organizationId: string;
  createdAt: Date;
  /**
   * Set when the deploy drain durably recorded its intent to cancel this run
   * before removing its queued job (#5450). The reconciler closes such a row
   * with a silent cancel regardless of age, never a loud failure.
   */
  cancelRequestedAt: Date | null;
}

/**
 * Keyset cursor for stable pagination, paired with `ORDER BY createdAt ASC,
 * id ASC` in `StalePendingSystemExecutionFinderService`: `createdAt` alone is
 * not unique, so the `id` tiebreaker is what makes "resume strictly after
 * this row" exact instead of merely approximate. Also doubles as the shape
 * of a lap's `upperBoundary` snapshot (#5319 — see
 * `PendingWorkflowExecutionReconcileService`, which owns advancing a cursor
 * and capturing a boundary per cohort across sweep ticks).
 */
export interface StalePendingSystemExecutionCursor {
  createdAt: Date;
  id: string;
}

export interface StalePendingSystemExecutionQueryOptions {
  limit?: number;
  cursor?: StalePendingSystemExecutionCursor;
  /**
   * Caps a lap to the finite set of rows that matched at lap start (#5319).
   * Without it, a cohort into which new rows keep arriving every tick would
   * never finish a lap: the moving time bound (`staleBefore`/`createdAfter`
   * recomputed fresh every tick) keeps admitting new candidates, so an
   * unordered or cursor-less page could stall forever behind rows that keep
   * a live, claimable BullMQ job. Freezing this single upper tuple at lap
   * start — rather than freezing the whole date window — still lets every
   * per-tick query re-evaluate `staleBefore`/`createdAfter` against the
   * current time, so a row's recent-vs-ancient classification (and
   * therefore its recovery action) always reflects its current age.
   */
  upperBoundary?: StalePendingSystemExecutionCursor;
}

/**
 * One cohort's in-progress lap (#5319 second review): `boundary` is the
 * `(createdAt, id)` snapshot captured when the lap started, and `cursor` is
 * how far into that bounded range the lap has advanced. A cohort with no lap
 * in progress is represented as `undefined`, not as this type — the next
 * tick starts a fresh one (see `PendingWorkflowExecutionReconcileService`).
 */
export interface StalePendingSystemExecutionLap {
  boundary: StalePendingSystemExecutionCursor;
  cursor: StalePendingSystemExecutionCursor | undefined;
}

/**
 * The pair of finder calls `PendingWorkflowExecutionReconcileService` needs
 * to drive one cohort's lap: `fetchBoundary` snapshots a fresh lap's
 * `StalePendingSystemExecutionLap.boundary` (called only when no lap is
 * already in progress), and `fetchPage` resumes it by exactly one page,
 * reusing `StalePendingSystemExecutionQueryOptions` rather than a bespoke
 * shape (#5319 second review).
 */
export interface StalePendingSystemExecutionCohortFinder {
  fetchBoundary: () => Promise<StalePendingSystemExecutionCursor | undefined>;
  fetchPage: (
    options: StalePendingSystemExecutionQueryOptions,
  ) => Promise<StalePendingSystemExecutionCandidate[]>;
}

/** The result of driving one cohort's lap forward by one page (#5319 second review). */
export interface StalePendingSystemExecutionSweepResult {
  candidates: StalePendingSystemExecutionCandidate[];
  lap: StalePendingSystemExecutionLap | undefined;
}
