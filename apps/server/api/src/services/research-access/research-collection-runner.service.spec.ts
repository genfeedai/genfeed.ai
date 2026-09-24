import type { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import type { ApifyRunBudgetService } from '@api/services/integrations/apify/services/modules/apify-run-budget.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { from, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchAccessService } from './research-access.service';
import {
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

  it('releases an expired start only after an empty list still matches the lease', async () => {
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
    jobs.finishExpiredUnrecorded.mockResolvedValue(true);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_start_unconfirmed');
    expect(http.post).not.toHaveBeenCalled();
    expect(jobs.finishExpiredUnrecorded).toHaveBeenCalledTimes(1);
    expect(budget.reconcileRun).toHaveBeenCalledWith(
      expect.objectContaining({ reservationKey: 'reservation-1' }),
      0,
    );
    vi.useRealTimers();
  });

  it('does not release an empty delayed list when the lease fence moved', async () => {
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
    jobs.finishExpiredUnrecorded.mockResolvedValue(false);

    await expect(
      runner.run('org-1', job.actorId, { query: 'acme' }),
    ).rejects.toThrow('research_collection_recovery_pending');
    expect(http.post).not.toHaveBeenCalled();
    expect(jobs.finishExpiredUnrecorded).toHaveBeenCalledTimes(1);
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
    expect(row?.inflightRequestKey).toEqual(expect.any(String));
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
