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
    const runs = await this.listRecentRuns(actorId, job);
    if (runs === null) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
      );
    }
    const startedAt = job.startAttemptedAt
      ? job.startAttemptedAt.getTime()
      : job.leaseExpiresAt
        ? job.leaseExpiresAt.getTime() - RESEARCH_COLLECTION_LEASE_MS
        : undefined;
    const sawRun =
      startedAt !== undefined &&
      runs.some((run) => {
        const started = Date.parse(run.startedAt);
        return Number.isFinite(started) && started >= startedAt - 2_000;
      });
    // A listed run we did not record may still be this start. Keep the
    // reservation and the in-flight row instead of launching another actor.
    if (sawRun) {
      throw new ServiceUnavailableException(
        'research_collection_recovery_pending',
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

  private async listRecentRuns(
    actorId: string,
    job: ResearchCollectionJobRecord,
  ): Promise<ApifyActorRun[] | null> {
    const token = await this.baseService.resolveCollectionToken(
      job.organizationId,
      collectionTokenMode(job.scope),
    );
    if (!token) return null;
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${API_URL}/acts/${this.baseService.normalizeActorId(actorId)}/runs?desc=1&limit=20`,
          { headers: this.authHeaders(token.token) },
        ),
      );
      return readRunItems(response.data);
    } catch (error: unknown) {
      this.loggerService.warn(
        'Research collection could not list actor runs for recovery',
        { actorId, error, organizationId: job.organizationId },
      );
      return null;
    }
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
