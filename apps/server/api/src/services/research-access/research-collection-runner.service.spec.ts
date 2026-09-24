import type { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import type { ApifyRunBudgetService } from '@api/services/integrations/apify/services/modules/apify-run-budget.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchAccessService } from './research-access.service';
import {
  RESEARCH_COLLECTION_JOB_STATUS,
  type ResearchCollectionJobRecord,
  type ResearchCollectionJobService,
} from './research-collection-job.service';
import { ResearchCollectionRunner } from './research-collection-runner.service';

const job: ResearchCollectionJobRecord = {
  actualCostMicroUsd: null,
  actorId: 'apify/facebook-ads-scraper',
  datasetId: 'dataset-1',
  id: 'job-1',
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
    attachReservation: vi.fn(),
    attachRun: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
    markAmbiguous: vi.fn(),
    markStarting: vi.fn(),
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

  it('does not post again after an ambiguous start', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:01:00.000Z'));
    jobs.claim.mockResolvedValue({
      ...job,
      isRecovered: true,
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
    expect(jobs.finish).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
