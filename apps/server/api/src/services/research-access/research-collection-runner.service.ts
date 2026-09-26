import type {
  ApifyActorRun,
  ApifyActorRunResponse,
  ApifyRunBudgetReservation,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyRunBudgetService } from '@api/services/integrations/apify/services/modules/apify-run-budget.service';
import { isAmbiguousApifyStartError } from '@api/services/integrations/apify/utils/apify-error.util';
import { ResearchAccessService } from '@api/services/research-access/research-access.service';
import {
  buildResearchCollectionRequestKey,
  RESEARCH_COLLECTION_JOB_STATUS,
  RESEARCH_COLLECTION_LEASE_MS,
  type ResearchCollectionJobRecord,
  ResearchCollectionJobService,
} from '@api/services/research-access/research-collection-job.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const API_URL = 'https://api.apify.com/v2';
const RUN_POLL_MS = 5_000;
const RUN_WAIT_MS = 120_000;
const TERMINAL_RUN_STATUSES = new Set([
  'ABORTED',
  'FAILED',
  'SUCCEEDED',
  'TIMED-OUT',
]);

/**
 * Upper bound for the actor-start POST itself. Apify's run-list API carries
 * no caller-supplied identity: a run object exposes only id/status/timing and
 * a provider-generated `meta` (origin/clientIp/userAgent), never a
 * correlation id we set, and the "Run Actor" endpoint has no query parameter
 * for one either. The only place a correlation value could ride along is the
 * actor `input` itself, but this runner starts ~20 different third-party
 * actors (see APIFY_ACTOR_REGISTRY in apify-base.service.ts) whose input
 * schemas we do not own and cannot verify here (no live Apify calls in this
 * change) — many Apify actor schemas reject unknown input properties, so
 * stuffing a correlation field into every request risks turning a rare,
 * already-mitigated recovery ambiguity into a routine, and much worse,
 * start failure. So the start call is bounded by an explicit timeout
 * instead: `isAmbiguousApifyStartError` can only fire (no HTTP status
 * received) within this window, which caps how late a run that is genuinely
 * ours can first appear in the actor's run list.
 */
const RUN_START_TIMEOUT_MS = 30_000;

/**
 * Clock skew and the small gap between recording `startAttemptedAt` and
 * actually issuing the POST (rate-limit bookkeeping runs in between).
 */
const RUN_START_MATCH_BUFFER_MS = 5_000;

/** Apify's per-page cap for this recovery lookup. */
const RUN_LIST_PAGE_LIMIT = 20;

/**
 * Sane ceiling on how far back recovery pages through an actor's run
 * history (RUN_LIST_MAX_PAGES * RUN_LIST_PAGE_LIMIT = 100 runs). Recovery
 * only runs on an already-rare ambiguous start, so this bounds the worst
 * case (an extremely busy shared actor) without turning a stuck recovery
 * into an unbounded crawl of Apify's API.
 */
const RUN_LIST_MAX_PAGES = 5;

/**
 * Hosted research collection. A retry uses the recorded Apify run before
 * any new start, and settles that run's cost at most once.
 */
@Injectable()
export class ResearchCollectionRunner {
  constructor(
    private readonly access: ResearchAccessService,
    private readonly jobs: ResearchCollectionJobService,
    private readonly budget: ApifyRunBudgetService,
    private readonly baseService: ApifyBaseService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  async run<T>(
    organizationId: string | undefined,
    actorId: string,
    input: object,
  ): Promise<T[]> {
    const decision = await this.access.decide(organizationId ?? '');
    if (!decision.isAllowed) {
      throw new ServiceUnavailableException(decision.reason);
    }
    if (!organizationId) {
      return this.baseService.runActor<T>(actorId, input);
    }
    const requestKey = buildResearchCollectionRequestKey({
      actorId,
      input,
      organizationId,
    });
    const job = await this.jobs.claim({
      actorId,
      organizationId,
      requestKey,
    });
    if (job.upstreamRunId) return this.finishRecordedRun(job);
    if (job.isRecovered) {
      // The owner may still be resolving a token or waiting on the POST.
      // An empty actor list is not evidence that start was rejected.
      if (isCollectionLeaseActive(job, new Date())) {
        throw new ServiceUnavailableException(
          'research_collection_recovery_pending',
        );
      }
      return this.recoverUnrecordedStart(job, actorId);
    }
    return this.startRun(job, actorId, input);
  }

  private async startRun<T>(
    job: ResearchCollectionJobRecord,
    actorId: string,
    input: object,
  ): Promise<T[]> {
    const token = await this.baseService.resolveCollectionToken(
      job.organizationId,
      'prefer-byok',
    );
    if (!token) {
      await this.jobs.finish(job, {
        status: RESEARCH_COLLECTION_JOB_STATUS.FAILED,
        terminalReason: 'collection_token_missing',
      });
      throw new ServiceUnavailableException(
        'paid_creative_apify_token_missing',
      );
    }
    const scope =
      token.source === 'byok' ? `byok:${job.organizationId}` : 'hosted';
    if (scope === 'hosted') {
      this.baseService.assertRegisteredHostedActor(actorId);
    }
    const startedAt = new Date();
    const ownsStart = await this.jobs.markStarting(job, {
      scope,
      startAttemptedAt: startedAt,
    });
    if (!ownsStart) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    const budget = await this.budget.consumeRun(scope, actorId, token.token);
    if (!budget.isAllowed) {
      await this.jobs.finish(job, {
        status: RESEARCH_COLLECTION_JOB_STATUS.FAILED,
        terminalReason: 'budget_paused',
      });
      throw new ServiceUnavailableException(
        budget.reason ?? 'Apify run budget exhausted',
      );
    }
    if (budget.reservation) {
      const reserved = await this.jobs.attachReservation(
        job,
        budget.reservation,
      );
      if (!reserved) {
        await this.releaseReservation(budget.reservation, 0);
        throw new ServiceUnavailableException(
          'research_collection_recovery_pending',
        );
      }
    }
    const run = await this.startActorOrStop(
      job,
      actorId,
      input,
      token.token,
      budget,
      scope,
      startedAt,
    );
    const recorded = await this.jobs.attachRun(job, {
      datasetId: run.defaultDatasetId,
      upstreamRunId: run.id,
    });
    if (!recorded) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    return this.finishRecordedRun({
      ...job,
      datasetId: run.defaultDatasetId,
      reservationKey: budget.reservation?.reservationKey ?? null,
      reservedMicroUsd: budget.reservation?.reservedMicroUsd ?? null,
      scope,
      upstreamRunId: run.id,
      usageKey: budget.reservation?.usageKey ?? null,
    });
  }

  private async startActorOrStop(
    job: ResearchCollectionJobRecord,
    actorId: string,
    input: object,
    token: string,
    budget: {
      maxTotalChargeUsd?: number;
      reservation?: ApifyRunBudgetReservation;
    },
    scope: string,
    startedAt: Date,
  ): Promise<ApifyActorRun> {
    try {
      return await this.postRun(
        actorId,
        input,
        token,
        budget.maxTotalChargeUsd,
      );
    } catch (error: unknown) {
      if (!isAmbiguousApifyStartError(error)) {
        await this.releaseReservation(budget.reservation, 0);
        await this.jobs.finish(job, {
          status: RESEARCH_COLLECTION_JOB_STATUS.FAILED,
          terminalReason: 'start_rejected',
        });
        throw error;
      }
      const leaseExpiresAt = await this.jobs.markAmbiguous(job);
      this.loggerService.warn(
        'Research collection start was ambiguous; refusing another actor start',
        { actorId, jobId: job.id, organizationId: job.organizationId },
      );
      if (!leaseExpiresAt) {
        throw new ServiceUnavailableException(
          'research_collection_recovery_pending',
        );
      }
      return this.recoverUnrecordedStart(
        {
          ...job,
          leaseExpiresAt,
          scope,
          startAttemptedAt: startedAt,
          status: RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS,
        },
        actorId,
      );
    }
  }

  private async finishRecordedRun<T>(
    job: ResearchCollectionJobRecord,
  ): Promise<T[]> {
    if (!job.upstreamRunId) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    const token = await this.baseService.resolveCollectionToken(
      job.organizationId,
      collectionTokenMode(job.scope),
    );
    if (!token) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    const run = await this.waitForRun(job.upstreamRunId, token.token);
    const usage = run.usageTotalUsd;
    if (usage === undefined || !Number.isFinite(usage) || usage < 0) {
      throw new ServiceUnavailableException(
        'research_collection_cost_unverified',
      );
    }
    if (!job.reconciledAt) {
      await this.releaseReservation(this.reservationFrom(job), usage);
    }
    const reconciledAt = job.reconciledAt ?? new Date();
    if (run.status !== 'SUCCEEDED') {
      await this.jobs.finish(job, {
        actualCostMicroUsd: this.toMicroUsd(usage),
        reconciledAt,
        status: RESEARCH_COLLECTION_JOB_STATUS.FAILED,
        terminalReason: `run_${run.status.toLowerCase()}`,
      });
      throw new ServiceUnavailableException(
        `Actor run ${run.id} ended with status: ${run.status}`,
      );
    }
    const rows = await this.readDataset<T>(run.defaultDatasetId, token.token);
    await this.jobs.finish(job, {
      actualCostMicroUsd: this.toMicroUsd(usage),
      reconciledAt,
      status: RESEARCH_COLLECTION_JOB_STATUS.SUCCEEDED,
      terminalReason: null,
    });
    return rows;
  }

  private async recoverUnrecordedStart(
    job: ResearchCollectionJobRecord,
    actorId: string,
  ): Promise<never> {
    const now = new Date();
    if (isCollectionLeaseActive(job, now)) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    const startedAt = job.startAttemptedAt
      ? job.startAttemptedAt.getTime()
      : job.leaseExpiresAt
        ? job.leaseExpiresAt.getTime() - RESEARCH_COLLECTION_LEASE_MS
        : undefined;
    // Page back only far enough to rule our own window out — a busy shared
    // actor's newest 20 runs can all postdate a start attempt that is even a
    // few minutes old, which would wrongly read as "no run seen" and send a
    // real, still-running job to UNRECONCILED. Legacy rows (no startedAt) have
    // nothing to bound pagination against, so they keep the single-page read.
    const lowerBoundMs =
      startedAt === undefined
        ? undefined
        : startedAt - RUN_START_MATCH_BUFFER_MS;
    const listed = await this.listRecentRuns(actorId, job, lowerBoundMs);
    if (listed === null) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    const { isComplete, runs } = listed;
    if (startedAt !== undefined && !isComplete) {
      // Paged RUN_LIST_MAX_PAGES deep and every page was still at or after
      // our window's lower bound: an extraordinarily busy actor could still
      // have our run further back than we looked. Treat this the same as a
      // failed list call — inconclusive, not "no match".
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    if (startedAt === undefined) {
      // A legacy row has no start bound recorded, so any listed run at
      // this actor might still be ours; only an empty list clears it below.
      if (runs.length > 0) {
        throw new ServiceUnavailableException(
          'research_collection_recovery_pending',
        );
      }
    } else {
      // Bound the match to the window our own start's POST call could
      // plausibly still be resolving in: from just before we attempted it
      // through its own explicit timeout (RUN_START_TIMEOUT_MS), not the
      // much longer anti-duplicate lease. leaseExpiresAt exists only to
      // block a second caller from starting another actor run while this
      // one is ambiguous — it must not also widen the evidence window, or
      // an unrelated run on the shared hosted token that starts anywhere in
      // that (up to 15-30 minute) span would count as ours and keep
      // recovery pending indefinitely, exactly the bug this fixes.
      const earliestStart = startedAt - RUN_START_MATCH_BUFFER_MS;
      const latestStart =
        startedAt + RUN_START_TIMEOUT_MS + RUN_START_MATCH_BUFFER_MS;
      const sawRun = runs.some((run) => {
        const started = Date.parse(run.startedAt);
        return (
          Number.isFinite(started) &&
          started >= earliestStart &&
          started <= latestStart
        );
      });
      if (sawRun) {
        throw new ServiceUnavailableException(
          'research_collection_recovery_pending',
        );
      }
      // No run in the list can be tied to our request — this covers both an
      // empty list and a list full of runs that started outside our narrow
      // window. Per the issue's requirement, a candidate that cannot be tied
      // to the request is not evidence either way, so both cases reconcile
      // the same way: UNRECONCILED (not FAILED, since we cannot confirm the
      // provider rejected the start), with the hold released. Splitting this
      // by runs.length would make FAILED depend on whether this actor
      // happens to have any run history at all, which is incidental and not
      // what the issue asks for.
      const reconciled = await this.jobs.finishUnreconciledStart(job, now);
      if (!reconciled) {
        throw new ServiceUnavailableException(
          'research_collection_recovery_pending',
        );
      }
      await this.releaseReservation(this.reservationFrom(job), 0);
      throw new ServiceUnavailableException(
        'research_collection_start_unreconciled',
      );
    }
    const released = await this.jobs.finishExpiredUnrecorded(job, now);
    if (!released) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    await this.releaseReservation(this.reservationFrom(job), 0);
    throw new ServiceUnavailableException(
      'research_collection_start_unconfirmed',
    );
  }

  private reservationFrom(
    job: ResearchCollectionJobRecord,
  ): ApifyRunBudgetReservation | undefined {
    if (!job.reservationKey || !job.usageKey || !job.reservedMicroUsd) {
      return undefined;
    }
    return {
      reservationKey: job.reservationKey,
      reservedMicroUsd: job.reservedMicroUsd,
      usageKey: job.usageKey,
    };
  }

  private async releaseReservation(
    reservation: ApifyRunBudgetReservation | undefined,
    actualUsageUsd: number | undefined,
  ): Promise<void> {
    await this.budget.reconcileRun(reservation, actualUsageUsd);
  }

  private async postRun(
    actorId: string,
    input: object,
    token: string,
    maxTotalChargeUsd?: number,
  ): Promise<ApifyActorRun> {
    const url = this.baseService.buildActorRunUrl(actorId, maxTotalChargeUsd);
    const response = await firstValueFrom(
      this.httpService.post<ApifyActorRunResponse>(url, input, {
        headers: this.authHeaders(token),
        timeout: RUN_START_TIMEOUT_MS,
      }),
    );
    return response.data.data;
  }

  private async waitForRun(
    runId: string,
    token: string,
  ): Promise<ApifyActorRun> {
    const started = Date.now();
    while (Date.now() - started < RUN_WAIT_MS) {
      const run = await this.readRun(runId, token);
      if (TERMINAL_RUN_STATUSES.has(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, RUN_POLL_MS));
    }
    throw new ServiceUnavailableException(
      'research_collection_recovery_pending',
    );
  }

  private async readRun(runId: string, token: string): Promise<ApifyActorRun> {
    const response = await firstValueFrom(
      this.httpService.get<ApifyActorRunResponse>(
        `${API_URL}/actor-runs/${encodeURIComponent(runId)}`,
        { headers: this.authHeaders(token) },
      ),
    );
    return response.data.data;
  }

  private async readDataset<T>(datasetId: string, token: string): Promise<T[]> {
    const response = await firstValueFrom(
      this.httpService.get<T[]>(
        `${API_URL}/datasets/${encodeURIComponent(datasetId)}/items`,
        { headers: this.authHeaders(token) },
      ),
    );
    return response.data;
  }

  /**
   * List an actor's runs, newest first, paging back with `offset` (Apify's
   * standard list pagination, shared by every list endpoint including this
   * one) until either a page is short (no more runs exist) or the oldest run
   * on the page already started before `lowerBoundMs` — anything further
   * back is even older and cannot fall inside our match window either. A
   * busy shared actor can produce more than RUN_LIST_PAGE_LIMIT runs within
   * a few minutes, so reading only the first page would let a real,
   * still-in-flight run silently age out of view and read as "no run seen".
   * `lowerBoundMs` is undefined for legacy rows with no start bound to page
   * against, which keeps their original single-page read.
   */
  private async listRecentRuns(
    actorId: string,
    job: ResearchCollectionJobRecord,
    lowerBoundMs: number | undefined,
  ): Promise<{ isComplete: boolean; runs: ApifyActorRun[] } | null> {
    const token = await this.baseService.resolveCollectionToken(
      job.organizationId,
      collectionTokenMode(job.scope),
    );
    if (!token) return null;
    const collected: ApifyActorRun[] = [];
    for (let page = 0; page < RUN_LIST_MAX_PAGES; page += 1) {
      const offset = page * RUN_LIST_PAGE_LIMIT;
      let items: ApifyActorRun[];
      try {
        const response = await firstValueFrom(
          this.httpService.get(
            `${API_URL}/acts/${this.baseService.normalizeActorId(actorId)}/runs?desc=1&limit=${RUN_LIST_PAGE_LIMIT}&offset=${offset}`,
            { headers: this.authHeaders(token.token) },
          ),
        );
        items = readRunItems(response.data);
      } catch (error: unknown) {
        this.loggerService.warn(
          'Research collection could not list actor runs for recovery',
          { actorId, error, offset, organizationId: job.organizationId },
        );
        return null;
      }
      collected.push(...items);
      if (items.length < RUN_LIST_PAGE_LIMIT) {
        return { isComplete: true, runs: collected }; // reached the end of the list
      }
      const oldestOnPage = Date.parse(items[items.length - 1].startedAt);
      if (
        lowerBoundMs === undefined ||
        !Number.isFinite(oldestOnPage) ||
        oldestOnPage < lowerBoundMs
      ) {
        return { isComplete: true, runs: collected }; // paged past the window's lower bound
      }
    }
    // Hit RUN_LIST_MAX_PAGES while every page so far was still full and still
    // at or after lowerBoundMs: an extraordinarily busy actor could still
    // have our run further back. Report incomplete rather than let the
    // caller treat this partial read as proof of "no match".
    return { isComplete: false, runs: collected };
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private toMicroUsd(value: number): number {
    return Math.round(value * 1_000_000);
  }
}

function isCollectionLeaseActive(
  job: ResearchCollectionJobRecord,
  now: Date,
): boolean {
  return (
    job.leaseExpiresAt !== null && job.leaseExpiresAt.getTime() > now.getTime()
  );
}

function collectionTokenMode(
  scope: string,
): 'byok-only' | 'hosted-only' | 'prefer-byok' {
  if (scope === 'hosted') return 'hosted-only';
  if (scope.startsWith('byok:')) return 'byok-only';
  return 'prefer-byok';
}

function readRunItems(payload: unknown): ApifyActorRun[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) return data as ApifyActorRun[];
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { items?: unknown }).items)
  ) {
    return (data as { items: ApifyActorRun[] }).items;
  }
  return [];
}
