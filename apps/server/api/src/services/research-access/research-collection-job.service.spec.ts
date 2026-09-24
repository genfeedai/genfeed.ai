import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';
import {
  RESEARCH_COLLECTION_JOB_STATUS,
  ResearchCollectionJobService,
} from './research-collection-job.service';

describe('ResearchCollectionJobService', () => {
  const findFirst = vi.fn();
  const create = vi.fn();
  const updateMany = vi.fn();
  const prisma = {
    researchCollectionJob: { create, findFirst, updateMany },
  } as unknown as PrismaService;
  const service = new ResearchCollectionJobService(prisma);
  const row = {
    actualCostMicroUsd: null,
    actorId: 'apify/facebook-ads-scraper',
    datasetId: null,
    id: 'job-1',
    leaseExpiresAt: new Date('2026-09-24T12:15:00.000Z'),
    leaseToken: 'lease-1',
    organizationId: 'org-1',
    reconciledAt: null,
    requestKey: 'request-1',
    reservationKey: null,
    reservedMicroUsd: null,
    scope: 'pending',
    startAttemptedAt: null,
    status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
    terminalReason: null,
    upstreamRunId: null,
    usageKey: null,
  };

  it('claims a new in-flight row for the organization', async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce(row);

    const claim = await service.claim({
      actorId: row.actorId,
      organizationId: 'org-1',
      requestKey: 'request-1',
    });

    expect(claim.isRecovered).toBe(false);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inflightRequestKey: 'request-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('returns the existing in-flight job instead of creating another', async () => {
    findFirst.mockResolvedValueOnce({
      ...row,
      upstreamRunId: 'run-1',
    });

    const claim = await service.claim({
      actorId: row.actorId,
      organizationId: 'org-1',
      requestKey: 'request-1',
    });

    expect(claim).toMatchObject({ isRecovered: true, upstreamRunId: 'run-1' });
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inflightRequestKey: 'request-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('recovers the winning row when two claims race', async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockRejectedValueOnce({ code: 'P2002' });
    findFirst.mockResolvedValueOnce({ ...row, id: 'job-2' });

    const claim = await service.claim({
      actorId: row.actorId,
      organizationId: 'org-1',
      requestKey: 'request-1',
    });

    expect(claim).toMatchObject({ id: 'job-2', isRecovered: true });
  });

  it('clears the in-flight key when a job finishes', async () => {
    await service.finish(row, {
      actualCostMicroUsd: 12_000,
      reconciledAt: new Date('2026-09-24T00:00:00.000Z'),
      status: RESEARCH_COLLECTION_JOB_STATUS.SUCCEEDED,
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inflightRequestKey: null }),
        where: expect.objectContaining({
          id: 'job-1',
          isDeleted: false,
          leaseToken: 'lease-1',
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('refreshes the lease when an ambiguous start still owns the row', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    const before = Date.now();

    const leaseExpiresAt = await service.markAmbiguous(row);

    expect(leaseExpiresAt).toBeInstanceOf(Date);
    expect(leaseExpiresAt?.getTime()).toBeGreaterThanOrEqual(
      before + 15 * 60 * 1000,
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leaseExpiresAt,
          status: RESEARCH_COLLECTION_JOB_STATUS.AMBIGUOUS,
        }),
        where: expect.objectContaining({
          leaseToken: 'lease-1',
          organizationId: 'org-1',
          status: RESEARCH_COLLECTION_JOB_STATUS.STARTING,
          upstreamRunId: null,
        }),
      }),
    );
  });

  it('does not refresh the lease after the start fence has moved', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.markAmbiguous(row)).resolves.toBeNull();
  });

  it('does not mark starting after the lease or status has moved', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.markStarting(row, {
        scope: 'hosted',
        startAttemptedAt: new Date('2026-09-24T12:00:00.000Z'),
      }),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leaseExpiresAt: { gt: new Date('2026-09-24T12:00:00.000Z') },
          leaseToken: 'lease-1',
          status: RESEARCH_COLLECTION_JOB_STATUS.REQUESTED,
        }),
      }),
    );
  });
});
