import { StalePendingSystemExecutionFinderService } from '@api/collections/workflow-executions/services/stale-pending-system-execution-finder.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { AgentExecutionRecoveryEventService } from '@api/services/agent-threading/services/agent-execution-recovery-event.service';
import type {
  StalePendingSystemExecutionCohortFinder,
  StalePendingSystemExecutionLap,
  StalePendingSystemExecutionSweepResult,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * A system-workflow execution older than this, still `PENDING`, is treated
 * as never claimed rather than merely slow — see #5162.
 */
const STALE_PENDING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * A `PENDING` row older than this is closed silently instead of loudly
 * failed — see `reconcileAncientCandidate` (#5252 review).
 */
const RECONCILE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * An interactive agent turn still `PENDING` this long after acceptance whose
 * job no worker has started is surfaced as failed instead of left "Running"
 * (#5622). A healthy queue starts a turn within seconds: the busiest healthy
 * queue in production over the incident window, `workflow-background`
 * (concurrency 8, 60/min), never showed an oldest-waiting job older than 92s.
 * 2 minutes is above that with headroom, and short enough that a user is not
 * left watching a spinner for an hour.
 */
const AGENT_TURN_START_DEADLINE_MS = 2 * 60 * 1000;

const AGENT_TURN_NEVER_STARTED_ERROR_MESSAGE =
  'This turn waited in the queue and never started. Send it again.';

const NEVER_CLAIMED_ERROR_MESSAGE =
  'This run was queued but no worker ever picked it up. Send a new message to retry.';

/**
 * Page size for each cohort's keyset sweep (#5319). Passed explicitly to the
 * finder and used here to detect "this page is the end of the lap" so the
 * two stay in lockstep — inferring "full page" from the finder's own default
 * would silently break if that default ever changed.
 */
const SWEEP_PAGE_SIZE = 200;

/**
 * Bounded-failure backstop for a stuck system-workflow run (#5162). A
 * `WorkflowExecution` normally moves out of `PENDING` within seconds; if it
 * has not after `STALE_PENDING_THRESHOLD_MS` AND its BullMQ job is gone or
 * sitting in a terminal state, no worker is ever going to pick it up — most
 * likely a pre-fix stale/terminal jobId collision (#5181), or a job that was
 * removed (`removeOnFail`/manual ops) after exhausting retries. Either way,
 * the caller (an agent thread polling for its turn to finish) must not keep
 * waiting on a run that will never move again.
 *
 * Two cohorts, two closing paths (#5252 review):
 * - Recent (createdAt within the last 24h, but past the 5-minute staleness
 *   bound): `completeExecution` — the same loud-failure transition an
 *   in-flight failure already uses. Fails loudly, records proactive-run
 *   accounting, and enqueues the usual workflow-outcome notification, so the
 *   client's own completion-recovery poll (`resolveStreamFromMessages`)
 *   observes a terminal status and surfaces the error instead of scheduling
 *   another watchdog tick forever. The caller is very likely still watching.
 * - Ancient (createdAt older than 24h): `cancelExecution` — a silent CAS to
 *   `CANCELLED`. Nobody is still polling a run this old; a *fresh* failure
 *   notification/webhook for it would be a notification-storm bug of its
 *   own, and `recordRun`'s consecutive-failure accounting was never earned
 *   by whatever actually happened to this row. It must still leave PENDING,
 *   though — a #5162-shaped bug from before this fix otherwise stays PENDING
 *   forever.
 *
 * Pagination (#5319, following up on #5252's own review comment, and a
 * second review of the first #5319 fix): each cohort's finder query returns
 * one bounded page (`SWEEP_PAGE_SIZE`) per tick. A page full of rows that
 * keep a live, still-claimable BullMQ job is left `PENDING` on purpose (see
 * above), so a cursor alone is not enough: `recentLap`/`ancientLap` (see
 * `StalePendingSystemExecutionLap`) additionally snapshot a fixed `boundary`
 * — the cohort's last matching row — when a lap starts (`startLap`), and
 * every page of that lap is capped to `(createdAt, id) <= boundary`. Without
 * that cap, a cohort that keeps receiving 200+ new candidates between ticks
 * would never finish a lap — every page would come back full forever (the
 * moving `staleBefore`/`createdAfter` bound keeps admitting new rows faster
 * than a single page can traverse them), so the cursor would never reset,
 * and a row examined once and left pending would never get a second look
 * even after it later becomes genuinely orphaned. Capping the lap to a fixed
 * boundary guarantees it finishes within a bounded number of ticks
 * (proportional to the cohort's size *at lap start*, not however large it
 * grows afterward); once it does, the cursor resets and the very next lap
 * re-queries the current `PENDING` set from scratch, picking up that row
 * again.
 *
 * Only `boundary` is frozen for a lap's duration — `staleBefore` and
 * `createdAfter` are still recomputed fresh on every tick (`reconcile`,
 * below), exactly as before this fix. That is what keeps a row's
 * recent-vs-ancient classification, and therefore which of the two recovery
 * paths above it gets, based on its *current* age rather than however old it
 * was when its lap started: a row that ages out of the recent window
 * mid-lap simply stops matching `findMany`'s `WHERE` on the next tick and
 * starts matching `findManyAncient`'s instead, the same as it always did.
 */
@Injectable()
export class PendingWorkflowExecutionReconcileService {
  private readonly logContext = 'PendingWorkflowExecutionReconcileService';

  /**
   * Lap state is kept per cohort, per service instance, in memory only: a
   * worker restart just starts the next lap over from the beginning, which
   * is safe (the underlying query is a stable, idempotent status filter) and
   * far simpler than persisting sweep progress for what is already a
   * best-effort backstop, not a source of truth.
   */
  private recentLap: StalePendingSystemExecutionLap | undefined;
  private ancientLap: StalePendingSystemExecutionLap | undefined;

  constructor(
    private readonly workflowExecutions: WorkflowExecutionsService,
    private readonly staleExecutionFinder: StalePendingSystemExecutionFinderService,
    private readonly queueService: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly agentExecutionRecoveryEvents?: AgentExecutionRecoveryEventService,
  ) {}

  async reconcile(): Promise<void> {
    const now = Date.now();
    const staleBefore = new Date(now - STALE_PENDING_THRESHOLD_MS);
    const createdAfter = new Date(now - RECONCILE_LOOKBACK_MS);

    await this.reconcileUnstartedAgentTurns(now, createdAfter);

    const recent = await this.sweepCohort(this.recentLap, {
      fetchBoundary: () =>
        this.staleExecutionFinder.findUpperBoundary(staleBefore, createdAfter),
      fetchPage: (options) =>
        this.staleExecutionFinder.findMany(staleBefore, createdAfter, options),
    });
    this.recentLap = recent.lap;
    for (const candidate of recent.candidates) {
      await this.reconcileCandidate(candidate, 'fail');
    }

    const ancient = await this.sweepCohort(this.ancientLap, {
      fetchBoundary: () =>
        this.staleExecutionFinder.findUpperBoundaryAncient(createdAfter),
      fetchPage: (options) =>
        this.staleExecutionFinder.findManyAncient(createdAfter, options),
    });
    this.ancientLap = ancient.lap;
    for (const candidate of ancient.candidates) {
      await this.reconcileCandidate(candidate, 'cancel');
    }
  }

  /**
   * The one place a still-claimable job is NOT left alone: a live agent turn
   * that is `PENDING` past `AGENT_TURN_START_DEADLINE_MS` with its job waiting
   * behind a backlog. The generic path below never surfaces that (the job is
   * claimable), so the user waits forever. The job is withdrawn first so the
   * turn cannot run later, after the user was told it failed and resent it; a
   * job a worker has already started is never touched.
   */
  private async reconcileUnstartedAgentTurns(
    now: number,
    createdAfter: Date,
  ): Promise<void> {
    try {
      const candidates =
        await this.staleExecutionFinder.findStalledInteractiveAgentTurns(
          new Date(now - AGENT_TURN_START_DEADLINE_MS),
          createdAfter,
          SWEEP_PAGE_SIZE,
        );
      for (const candidate of candidates) {
        await this.failUnstartedAgentTurn(candidate);
      }
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext} failed to sweep unstarted agent turns`,
        { error },
      );
    }
  }

  private async failUnstartedAgentTurn(candidate: {
    id: string;
    organizationId: string;
  }): Promise<void> {
    try {
      const outcome =
        await this.queueService.withdrawUnstartedSystemWorkflowJob(
          `system-workflow-${candidate.id}`,
        );
      if (outcome === 'started') return;

      // Before the execution closes, so the thread's status push sees the
      // change (#5636); the execution alone would leave the thread "Running".
      await this.agentExecutionRecoveryEvents?.recordExecutionEnded(
        candidate.id,
        { error: AGENT_TURN_NEVER_STARTED_ERROR_MESSAGE, type: 'failed' },
      );
      await this.workflowExecutions.completeExecution(
        candidate.id,
        candidate.organizationId,
        AGENT_TURN_NEVER_STARTED_ERROR_MESSAGE,
      );
      this.logger.error(
        `${this.logContext} surfaced an agent turn that never started`,
        {
          executionId: candidate.id,
          isJobWithdrawn: outcome === 'removed',
          organizationId: candidate.organizationId,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext} failed to surface an unstarted agent turn`,
        {
          error,
          executionId: candidate.id,
          organizationId: candidate.organizationId,
        },
      );
    }
  }

  /**
   * Drives one cohort's lap forward by exactly one page. Starts a fresh lap
   * (snapshotting `boundary`) when none is in progress; otherwise resumes
   * the existing one from its `cursor`. The lap ends — `lap` comes back
   * `undefined` — once a page comes back shorter than `SWEEP_PAGE_SIZE`,
   * which can only happen once nothing remains between `cursor` and
   * `boundary` (rows in that range can shrink as they transition out, but
   * `boundary` guarantees nothing outside the lap-start snapshot can grow
   * it back to a full page).
   */
  private async sweepCohort(
    lap: StalePendingSystemExecutionLap | undefined,
    finder: StalePendingSystemExecutionCohortFinder,
  ): Promise<StalePendingSystemExecutionSweepResult> {
    const activeLap = lap ?? (await this.startLap(finder.fetchBoundary));
    if (!activeLap) {
      // Nothing currently matches this cohort — no lap to run this tick.
      return { candidates: [], lap: undefined };
    }

    const page = await finder.fetchPage({
      cursor: activeLap.cursor,
      upperBoundary: activeLap.boundary,
      limit: SWEEP_PAGE_SIZE,
    });
    if (page.length === 0) {
      return { candidates: [], lap: undefined };
    }

    const last = page[page.length - 1];
    const lapContinues = page.length >= SWEEP_PAGE_SIZE;
    return {
      candidates: page,
      lap: lapContinues
        ? {
            boundary: activeLap.boundary,
            cursor: { createdAt: last.createdAt, id: last.id },
          }
        : undefined,
    };
  }

  private async startLap(
    fetchBoundary: StalePendingSystemExecutionCohortFinder['fetchBoundary'],
  ): Promise<StalePendingSystemExecutionLap | undefined> {
    const boundary = await fetchBoundary();
    return boundary ? { boundary, cursor: undefined } : undefined;
  }

  private async reconcileCandidate(
    candidate: {
      id: string;
      organizationId: string;
      cancelRequestedAt: Date | null;
    },
    cohortAction: 'cancel' | 'fail',
  ): Promise<void> {
    // A row the deploy drain intentionally emptied of its job (#5450) is
    // closed silently whatever its age: `completeExecution` would emit a
    // customer-visible failure and count toward the strategy's consecutive
    // failures, which the drain never earned. The intent stays on the row
    // until `cancelExecution` succeeds, so a failure here just retries next lap.
    const action = candidate.cancelRequestedAt ? 'cancel' : cohortAction;
    try {
      const hasLiveJob = await this.queueService.hasClaimableSystemWorkflowJob(
        `system-workflow-${candidate.id}`,
      );
      if (hasLiveJob) return;

      if (action === 'fail') {
        await this.agentExecutionRecoveryEvents?.recordExecutionEnded(
          candidate.id,
          { error: NEVER_CLAIMED_ERROR_MESSAGE, type: 'failed' },
        );
        await this.workflowExecutions.completeExecution(
          candidate.id,
          candidate.organizationId,
          NEVER_CLAIMED_ERROR_MESSAGE,
        );
        this.logger.error(
          `${this.logContext} surfaced a never-claimed workflow execution`,
          {
            executionId: candidate.id,
            organizationId: candidate.organizationId,
          },
        );
        return;
      }

      // The thread ends its run too, or it would stay "Running" in a sidebar
      // that reads only the thread summary (#5636), however old the turn.
      await this.agentExecutionRecoveryEvents?.recordExecutionEnded(
        candidate.id,
        { type: 'cancelled' },
      );
      await this.workflowExecutions.cancelExecution(
        candidate.id,
        candidate.organizationId,
      );
      this.logger.log(
        candidate.cancelRequestedAt
          ? `${this.logContext} silently cancelled a workflow execution whose job the deploy drain removed`
          : `${this.logContext} silently cancelled an ancient never-claimed workflow execution`,
        {
          executionId: candidate.id,
          organizationId: candidate.organizationId,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext} failed to reconcile a stale pending execution`,
        {
          error,
          executionId: candidate.id,
          organizationId: candidate.organizationId,
        },
      );
    }
  }
}
