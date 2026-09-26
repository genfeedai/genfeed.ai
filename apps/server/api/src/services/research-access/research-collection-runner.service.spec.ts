import type { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import type { ApifyRunBudgetService } from '@api/services/integrations/apify/services/modules/apify-run-budget.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { from, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchAccessService } from './research-access.service';
import {
  buildResearchCollectionRequestKey,
  RESEARCH_COLLECTION_JOB_STATUS,
  type ResearchCollectionJobRecord,
  ResearchCollectionJobService,
} from './research-collection-job.service';
import { ResearchCollectionRunner } from './research-collection-runner.service';

const job: ResearchCollectionJobRecord = {
  actualCostMicroUsd: null,
  actorId: 'apify/facebook-ads-scraper',
  datasetId: 'dataset-1',
  id: 'job-1',
  leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
  leaseToken: 'lease-1',
  organizationId: 'org-1',
  reconciledAt: null,
  requestKey: 'request-1',
  reservationKey: 'reservation-1',
  reservedMicroUsd: 100_000,
  scope: 'hosted',
  startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
  status: RESEARCH_COLLECTION_JOB_STATUS.RUNNING,
  terminalReason: null,
  upstreamRunId: 'run-1',
  usageKey: 'usage-1',
};

describe('ResearchCollectionRunner', () => {
  const access = { decide: vi.fn() };
  const jobs = {
    attachReservation: vi.fn().mockResolvedValue(true),
    attachRun: vi.fn().mockResolvedValue(true),
    claim: vi.fn(),
    finish: vi.fn(),
    finishExpiredUnrecorded: vi.fn(),
    finishUnreconciledStart: vi.fn(),
    markAmbiguous: vi.fn(),
    markStarting: vi.fn().mockResolvedValue(true),
  };
  const budget = {
    consumeRun: vi.fn(),
    reconcileRun: vi.fn(),
  };
  const baseService = {
    assertRegisteredHostedActor: vi.fn(),
    buildActorRunUrl: vi
      .fn()
      .mockReturnValue('https://api.apify.com/v2/acts/run'),
    normalizeActorId: vi.fn().mockReturnValue('apify~facebook-ads-scraper'),
    resolveCollectionToken: vi.fn(),
    runActor: vi.fn(),
  };
  const http = { get: vi.fn(), post: vi.fn() };
  const logger = { warn: vi.fn() };
  const runner = new ResearchCollectionRunner(
    access as unknown as ResearchAccessService,
    jobs as unknown as ResearchCollectionJobService,
    budget as unknown as ApifyRunBudgetService,
    baseService as unknown as ApifyBaseService,
    http as unknown as HttpService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    access.decide.mockResolvedValue({
      isAllowed: true,
      reason: 'active_paid',
    });
  });

  it('does not start a run when paid access is missing', async () => {
    access.decide.mockResolvedValue({
      isAllowed: false,
      reason: 'research_paid_access_required',
    });

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(jobs.claim).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('resumes a recorded run instead of posting another start', async () => {
    jobs.claim.mockResolvedValue({ ...job, isRecovered: true });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get
      .mockReturnValueOnce(
        of({
          data: {
            data: {
              defaultDatasetId: 'dataset-1',
              id: 'run-1',
              status: 'SUCCEEDED',
              usageTotalUsd: 0.02,
            },
          },
        }),
      )
      .mockReturnValueOnce(of({ data: [{ id: 'ad-1' }] }));

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).resolves.toEqual([{ id: 'ad-1' }]);
    expect(http.post).not.toHaveBeenCalled();
    expect(budget.reconcileRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationKey: 'reservation-1' }),
      0.02,
    );
  });

  it('keeps the reservation when a delayed list shows the run after the lease', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:16:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get.mockReturnValue(
      of({
        data: {
          data: {
            items: [
              {
                id: 'run-9',
                startedAt: '2026-09-24T12:00:01.000Z',
                status: 'RUNNING',
              },
            ],
          },
        },
      }),
    );

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(jobs.finish).not.toHaveBeenCalled();
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps an active start when a duplicate lists no run yet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      reservationKey: 'reservation-1',
      reservedMicroUsd: 100_000,
      startAttemptedAt: null,
      status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
      upstreamRunId: null,
    });
    http.get.mockReturnValue(of({ data: { data: { items: [] } } }));

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
    expect(jobs.finish).not.toHaveBeenCalled();
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps the reservation when an ambiguous timeout still owns the start', async () => {
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: false,
      startAttemptedAt: null,
      status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    budget.consumeRun.mockResolvedValue({
      isAllowed: true,
      maxTotalChargeUsd: 0.25,
      reservation: {
        reservationKey: 'reservation-1',
        reservedMicroUsd: 100_000,
        usageKey: 'usage-1',
      },
    });
    jobs.markAmbiguous.mockResolvedValue(new Date(Date.now() + 15 * 60 * 1000));
    http.post.mockReturnValue(throwError(() => new Error('timeout')));

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(jobs.markAmbiguous).toHaveBeenCalledTimes(1);
    expect(http.get).not.toHaveBeenCalled();
    expect(jobs.finish).not.toHaveBeenCalled();
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).not.toHaveBeenCalled();
  });

  it('does not post when the start fence has already moved', async () => {
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: false,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    jobs.markStarting.mockResolvedValue(false);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(budget.consumeRun).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('reconciles as unreconciled, not failed, once an empty list still matches the lease', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:16:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get.mockReturnValue(of({ data: { data: { items: [] } } }));
    jobs.finishUnreconciledStart.mockResolvedValue(true);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_start_unreconciled');
    expect(http.post).not.toHaveBeenCalled();
    expect(jobs.finishUnreconciledStart).toHaveBeenCalledTimes(1);
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationKey: 'reservation-1' }),
      0,
    );
    vi.useRealTimers();
  });

  it('does not keep recovery pending on an unrelated run far outside the start-timeout window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:16:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get.mockReturnValue(
      of({
        data: {
          data: {
            // A different request against the same actor, well before "now"
            // (12:16) but also well past our own start's ~35s match window
            // (12:00:00 + RUN_START_TIMEOUT_MS + buffer). Still inside the
            // old, much wider lease window this bug used to key off.
            items: [
              {
                id: 'run-unrelated',
                startedAt: '2026-09-24T12:10:00.000Z',
                status: 'RUNNING',
              },
            ],
          },
        },
      }),
    );
    jobs.finishUnreconciledStart.mockResolvedValue(true);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_start_unreconciled');
    expect(http.post).not.toHaveBeenCalled();
    expect(jobs.finishUnreconciledStart).toHaveBeenCalledTimes(1);
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationKey: 'reservation-1' }),
      0,
    );
    vi.useRealTimers();
  });

  it('keeps recovery pending on an unrelated run that lands inside the start-timeout window', async () => {
    // The dangerous case the issue calls out: on the shared hosted token,
    // another org's request can genuinely start a run within a few seconds
    // of ours. We cannot tie a candidate run to our request (Apify's run
    // list carries no caller-supplied identity — see the RUN_START_TIMEOUT_MS
    // comment in the runner), so a same-actor run this close in time is
    // treated as possible evidence and recovery stays pending rather than
    // risk reconciling a job whose actor start may in fact still be running.
    // The lease has still expired (now is past leaseExpiresAt) so this
    // exercises the actual run-list match, not the outer active-lease guard.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:16:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get.mockReturnValue(
      of({
        data: {
          data: {
            items: [
              {
                // Another org's or request's run, started 10s after ours —
                // inside the ~35s match window, indistinguishable from ours.
                id: 'run-another-org',
                startedAt: '2026-09-24T12:00:10.000Z',
                status: 'RUNNING',
              },
            ],
          },
        },
      }),
    );

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).not.toHaveBeenCalled();
    expect(jobs.finishUnreconciledStart).not.toHaveBeenCalled();
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps recovery pending when the unreconciled transition loses the race', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:16:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get.mockReturnValue(
      of({
        data: {
          data: {
            items: [
              {
                id: 'run-unrelated',
                startedAt: '2026-09-24T12:10:00.000Z',
                status: 'RUNNING',
              },
            ],
          },
        },
      }),
    );
    jobs.finishUnreconciledStart.mockResolvedValue(false);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(jobs.finishUnreconciledStart).toHaveBeenCalledTimes(1);
    expect(budget.reconcileRun).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not release an empty delayed list when the unreconciled fence moved', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:16:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
      leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
      startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
      upstreamRunId: null,
    });
    baseService.resolveCollectionToken.mockResolvedValue({
      source: 'hosted',
      token: 'token',
    });
    http.get.mockReturnValue(of({ data: { data: { items: [] } } }));
    jobs.finishUnreconciledStart.mockResolvedValue(false);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).not.toHaveBeenCalled();
    expect(jobs.finishUnreconciledStart).toHaveBeenCalledTimes(1);
    expect(jobs.finishExpiredUnrecorded).not.toHaveBeenCalled();
    expect(budget.reconcileRun).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('deferred collection start', () => {
  it('lets the owner finish one actor while a duplicate sees no run yet', async () => {
    let row: Record<string, unknown> | null = null;
    const matches = (
      candidate: Record<string, unknown> | null,
      where: Record<string, unknown>,
    ): boolean => {
      if (!candidate) return false;
      for (const [key, expected] of Object.entries(where)) {
        if (key === 'OR') {
          const branches = expected as Record<string, unknown>[];
          if (!branches.some((branch) => matches(candidate, branch))) {
            return false;
          }
          continue;
        }
        if (
          expected &&
          typeof expected === 'object' &&
          !(expected instanceof Date)
        ) {
          const filter = expected as { gt?: Date; in?: unknown[]; lte?: Date };
          const value = candidate[key];
          if (
            filter.gt &&
            (!(value instanceof Date) || value.getTime() <= filter.gt.getTime())
          ) {
            return false;
          }
          if (
            filter.lte &&
            (!(value instanceof Date) || value.getTime() > filter.lte.getTime())
          ) {
            return false;
          }
          if (filter.in && !filter.in.includes(value)) return false;
          continue;
        }
        if (candidate[key] !== expected) return false;
      }
      return true;
    };
    const prisma = {
      researchCollectionJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          row = {
            datasetId: null,
            reservationKey: null,
            reservedMicroUsd: null,
            startAttemptedAt: null,
            upstreamRunId: null,
            ...data,
            id: 'job-1',
          };
          return { ...row };
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          matches(row, where) ? { ...row } : null,
        updateMany: async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          if (!matches(row, where) || !row) return { count: 0 };
          row = { ...row, ...data };
          return { count: 1 };
        },
      },
    };
    let releasePost: (value: {
      data: {
        data: {
          defaultDatasetId: string;
          id: string;
          status: string;
          usageTotalUsd: number;
        };
      };
    }) => void = () => undefined;
    const posted = new Promise<Parameters<typeof releasePost>[0]>((resolve) => {
      releasePost = resolve;
    });
    const http = {
      get: vi
        .fn()
        .mockReturnValueOnce(
          of({
            data: {
              data: {
                defaultDatasetId: 'dataset-1',
                id: 'run-1',
                status: 'SUCCEEDED',
                usageTotalUsd: 0.01,
              },
            },
          }),
        )
        .mockReturnValueOnce(of({ data: [{ id: 'ad-1' }] })),
      post: vi.fn(() => from(posted)),
    };
    const budget = {
      consumeRun: vi.fn().mockResolvedValue({
        isAllowed: true,
        maxTotalChargeUsd: 0.25,
        reservation: {
          reservationKey: 'reservation-1',
          reservedMicroUsd: 100_000,
          usageKey: 'usage-1',
        },
      }),
      reconcileRun: vi.fn(),
    };
    const runner = new ResearchCollectionRunner(
      {
        decide: vi.fn().mockResolvedValue({
          isAllowed: true,
          reason: 'active_paid',
        }),
      } as unknown as ResearchAccessService,
      new ResearchCollectionJobService(prisma as never),
      budget as unknown as ApifyRunBudgetService,
      {
        assertRegisteredHostedActor: vi.fn(),
        buildActorRunUrl: vi
          .fn()
          .mockReturnValue('https://api.apify.com/v2/runs'),
        normalizeActorId: vi.fn().mockReturnValue('apify~facebook-ads-scraper'),
        resolveCollectionToken: vi
          .fn()
          .mockResolvedValue({ source: 'hosted', token: 'token' }),
      } as unknown as ApifyBaseService,
      http as unknown as HttpService,
      { warn: vi.fn() } as unknown as LoggerService,
    );

    const first = runner.run('org-1', 'apify/facebook-ads-scraper', {
      query: 'acme',
    });
    await vi.waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    await expect(
      runner.run('org-1', 'apify/facebook-ads-scraper', { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(budget.reconcileRun).not.toHaveBeenCalled();
    // Closures assign `row`. Read its declared type; control flow otherwise
    // keeps the null initializer and treats this property as `never`.
    const readRow = (): Record<string, unknown> | null => row;
    expect(readRow()?.inflightRequestKey).toEqual(expect.any(String));
    releasePost({
      data: {
        data: {
          defaultDatasetId: 'dataset-1',
          id: 'run-1',
          status: 'SUCCEEDED',
          usageTotalUsd: 0.01,
        },
      },
    });
    await expect(first).resolves.toEqual([{ id: 'ad-1' }]);
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});

describe('pre-migration collection rows', () => {
  const actorId = 'apify/facebook-ads-scraper';
  const input = { query: 'acme' };
  const requestKey = buildResearchCollectionRequestKey({
    actorId,
    input,
    organizationId: 'org-1',
  });

  function legacyRunner(seed: Record<string, unknown>) {
    let row: Record<string, unknown> | null = { ...seed };
    let nextId = 2;
    const matches = (
      candidate: Record<string, unknown> | null,
      where: Record<string, unknown>,
    ): boolean => {
      if (!candidate) return false;
      for (const [key, expected] of Object.entries(where)) {
        if (key === 'OR') {
          const branches = expected as Record<string, unknown>[];
          if (!branches.some((branch) => matches(candidate, branch))) {
            return false;
          }
          continue;
        }
        if (
          expected &&
          typeof expected === 'object' &&
          !(expected instanceof Date)
        ) {
          const filter = expected as { gt?: Date; in?: unknown[]; lte?: Date };
          const value = candidate[key];
          if (
            filter.gt &&
            (!(value instanceof Date) || value.getTime() <= filter.gt.getTime())
          ) {
            return false;
          }
          if (
            filter.lte &&
            (!(value instanceof Date) || value.getTime() > filter.lte.getTime())
          ) {
            return false;
          }
          if (filter.in && !filter.in.includes(value)) return false;
          continue;
        }
        if (candidate[key] !== expected) return false;
      }
      return true;
    };
    const prisma = {
      researchCollectionJob: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          row = {
            datasetId: null,
            leaseExpiresAt: null,
            reservationKey: null,
            reservedMicroUsd: null,
            startAttemptedAt: null,
            upstreamRunId: null,
            ...data,
            id: `job-${nextId}`,
          };
          nextId += 1;
          return { ...row };
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          matches(row, where) ? { ...(row ?? {}) } : null,
        updateMany: async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          if (!matches(row, where) || !row) return { count: 0 };
          row = { ...row, ...data };
          return { count: 1 };
        },
      },
    };
    const http = { get: vi.fn(), post: vi.fn() };
    const budget = {
      consumeRun: vi.fn().mockResolvedValue({
        isAllowed: true,
        maxTotalChargeUsd: 0.25,
        reservation: {
          reservationKey: 'reservation-next',
          reservedMicroUsd: 100_000,
          usageKey: 'usage-next',
        },
      }),
      reconcileRun: vi.fn(),
    };
    const runner = new ResearchCollectionRunner(
      {
        decide: vi.fn().mockResolvedValue({
          isAllowed: true,
          reason: 'active_paid',
        }),
      } as unknown as ResearchAccessService,
      new ResearchCollectionJobService(prisma as never),
      budget as unknown as ApifyRunBudgetService,
      {
        assertRegisteredHostedActor: vi.fn(),
        buildActorRunUrl: vi
          .fn()
          .mockReturnValue('https://api.apify.com/v2/runs'),
        normalizeActorId: vi.fn().mockReturnValue('apify~facebook-ads-scraper'),
        resolveCollectionToken: vi
          .fn()
          .mockResolvedValue({ source: 'hosted', token: 'token' }),
      } as unknown as ApifyBaseService,
      http as unknown as HttpService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    return {
      budget,
      http,
      read: () => row,
      runner,
    };
  }

  function legacyRow(
    overrides: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      actorId,
      actualCostMicroUsd: null,
      datasetId: 'dataset-legacy',
      id: 'legacy-1',
      inflightRequestKey: requestKey,
      isDeleted: false,
      leaseExpiresAt: null,
      leaseToken: null,
      organizationId: 'org-1',
      reconciledAt: null,
      requestKey,
      reservationKey: 'reservation-legacy',
      reservedMicroUsd: 100_000,
      scope: 'hosted',
      startAttemptedAt: null,
      status: RESEARCH_COLLECTION_JOB_STATUS.RUNNING,
      terminalReason: null,
      upstreamRunId: 'run-legacy',
      usageKey: 'usage-legacy',
      ...overrides,
    };
  }

  it('clears a recorded pre-migration run and starts a new collection', async () => {
    const { budget, http, read, runner } = legacyRunner(legacyRow({}));
    http.get
      .mockReturnValueOnce(
        of({
          data: {
            data: {
              defaultDatasetId: 'dataset-legacy',
              id: 'run-legacy',
              status: 'SUCCEEDED',
              usageTotalUsd: 0.02,
            },
          },
        }),
      )
      .mockReturnValueOnce(of({ data: [{ id: 'ad-legacy' }] }))
      .mockReturnValueOnce(
        of({
          data: {
            data: {
              defaultDatasetId: 'dataset-2',
              id: 'run-2',
              status: 'SUCCEEDED',
              usageTotalUsd: 0.01,
            },
          },
        }),
      )
      .mockReturnValueOnce(of({ data: [{ id: 'ad-2' }] }));
    http.post.mockReturnValue(
      of({
        data: {
          data: {
            defaultDatasetId: 'dataset-2',
            id: 'run-2',
            status: 'RUNNING',
            usageTotalUsd: 0,
          },
        },
      }),
    );

    await expect(runner.run('org-1', actorId, input)).resolves.toEqual([
      { id: 'ad-legacy' },
    ]);
    expect(read()?.inflightRequestKey).toBeNull();
    expect(read()?.leaseToken).toEqual(expect.any(String));
    expect(budget.reconcileRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationKey: 'reservation-legacy' }),
      0.02,
    );

    await expect(runner.run('org-1', actorId, input)).resolves.toEqual([
      { id: 'ad-2' },
    ]);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(read()?.id).toBe('job-2');
    expect(read()?.inflightRequestKey).toBeNull();
  });

  it('releases a pre-migration ambiguous row only when no run is listed', async () => {
    const { budget, http, read, runner } = legacyRunner(
      legacyRow({
        datasetId: null,
        startAttemptedAt: null,
        status: RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS,
        upstreamRunId: null,
      }),
    );
    http.get.mockReturnValueOnce(
      of({
        data: {
          data: {
            items: [
              {
                id: 'run-unknown',
                startedAt: '2026-09-24T12:00:00.000Z',
                status: 'RUNNING',
              },
            ],
          },
        },
      }),
    );

    await expect(runner.run('org-1', actorId, input)).rejects.toThrow(
      'research_collection_recovery_pending',
    );
    expect(read()?.inflightRequestKey).toBe(requestKey);
    expect(budget.reconcileRun).not.toHaveBeenCalled();

    http.get.mockReturnValueOnce(of({ data: { data: { items: [] } } }));
    await expect(runner.run('org-1', actorId, input)).rejects.toThrow(
      'research_collection_start_unconfirmed',
    );
    expect(read()?.inflightRequestKey).toBeNull();
    expect(read()?.leaseToken).toEqual(expect.any(String));
    expect(budget.reconcileRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationKey: 'reservation-legacy' }),
      0,
    );
  });
});
