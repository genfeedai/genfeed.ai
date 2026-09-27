import {
  type StalePendingSystemExecutionCursor,
  StalePendingSystemExecutionFinderService,
} from '@api/collections/workflow-executions/services/stale-pending-system-execution-finder.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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

const NEVER_CLAIMED_ERROR_MESSAGE =
  'This run was queued but no worker ever picked it up. Send a new message to retry.';

/**
 * Page size for each cohort's keyset sweep (#5319). Passed explicitly to
 * the finder and to `nextCursor` so the two stay in lockstep — inferring
 * "full page" from the finder's own default would silently break if that
 * default ever changed.
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
 * Pagination (#5319, following up on #5252's own review comment): each
 * cohort's finder query returns one bounded page (still 200 rows) per tick,
 * but this service now remembers a `(createdAt, id)` keyset `cursor` per
 * cohort across ticks instead of always re-querying from the start. A page
 * full of rows that keep a live, still-claimable BullMQ job is left PENDING
 * on purpose (see above) — without a cursor that survives the tick, the next
 * sweep would fetch that identical unordered/unbounded-from-the-top page
 * again and any row past it would never be reached. Advancing the cursor
 * past every row this tick examined — reconciled or left pending, it does
 * not matter which — guarantees a full lap over a cohort completes, and
 * therefore every stale candidate gets examined, within a bounded number of
 * ticks proportional to the cohort's size, however many rows keep a live
 * job. Once a page comes back short (fewer than the page size), that cohort
 * has reached the end of its current backlog and the cursor resets so the
 * next tick starts a fresh lap — covering newly-created candidates that
 * arrived after the previous lap began.
 */
@Injectable()
export class PendingWorkflowExecutionReconcileService {
  private readonly logContext = 'PendingWorkflowExecutionReconcileService';

  /**
   * Keyset cursors are kept per cohort, per service instance. They are
   * intentionally in-memory only: a worker restart just starts the next lap
   * over from the beginning, which is safe (the underlying query is a stable
   * idempotent status filter) and far simpler than persisting sweep progress
   * for what is already a best-effort backstop, not a source of truth.
   */
  private recentCursor: StalePendingSystemExecutionCursor | undefined;
  private ancientCursor: StalePendingSystemExecutionCursor | undefined;

  constructor(
    private readonly workflowExecutions: WorkflowExecutionsService,
    private readonly staleExecutionFinder: StalePendingSystemExecutionFinderService,
    private readonly queueService: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  async reconcile(): Promise<void> {
    const now = Date.now();
    const staleBefore = new Date(now - STALE_PENDING_THRESHOLD_MS);
    const createdAfter = new Date(now - RECONCILE_LOOKBACK_MS);

    const recentCandidates = await this.staleExecutionFinder.findMany(
      staleBefore,
      createdAfter,
      { cursor: this.recentCursor, limit: SWEEP_PAGE_SIZE },
    );
    this.recentCursor = this.nextCursor(recentCandidates);
    for (const candidate of recentCandidates) {
      await this.reconcileCandidate(candidate, 'fail');
    }

    const ancientCandidates = await this.staleExecutionFinder.findManyAncient(
      createdAfter,
      { cursor: this.ancientCursor, limit: SWEEP_PAGE_SIZE },
    );
    this.ancientCursor = this.nextCursor(ancientCandidates);
    for (const candidate of ancientCandidates) {
      await this.reconcileCandidate(candidate, 'cancel');
    }
  }

  /**
   * Advances a cohort's cursor past the last row of the page just fetched —
   * whether or not any of those rows actually transitioned out of PENDING —
   * so the next tick resumes the lap instead of re-fetching the same page.
   * A page shorter than the finder's default page size (200) means this lap
   * has reached the end of the cohort's current backlog; resetting to
   * `undefined` starts the next tick's lap from the beginning again, so
   * newly-created candidates are picked up once the current lap finishes.
   */
  private nextCursor(
    page: ReadonlyArray<{ id: string; createdAt: Date }>,
  ): StalePendingSystemExecutionCursor | undefined {
    if (page.length < SWEEP_PAGE_SIZE) {
      return undefined;
    }
    const last = page[page.length - 1];
    return { createdAt: last.createdAt, id: last.id };
  }

  private async reconcileCandidate(
    candidate: { id: string; organizationId: string },
    action: 'cancel' | 'fail',
  ): Promise<void> {
    try {
      const hasLiveJob = await this.queueService.hasClaimableSystemWorkflowJob(
        `system-workflow-${candidate.id}`,
      );
      if (hasLiveJob) return;

      if (action === 'fail') {
        await this.workflowExecutions.completeExecution(
          candidate.id,
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

      await this.workflowExecutions.cancelExecution(candidate.id);
      this.logger.log(
        `${this.logContext} silently cancelled an ancient never-claimed workflow execution`,
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
