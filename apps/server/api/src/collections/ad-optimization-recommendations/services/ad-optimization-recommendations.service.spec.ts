import type { PrismaAdOptimizationRecommendation } from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import { ConflictException } from '@nestjs/common';
import { AdOptimizationRecommendationsService } from './ad-optimization-recommendations.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function makeRow(
  data: Record<string, unknown>,
  overrides: Partial<PrismaAdOptimizationRecommendation> = {},
): PrismaAdOptimizationRecommendation {
  return {
    createdAt: NOW,
    data: data as PrismaAdOptimizationRecommendation['data'],
    id: 'rec-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: NOW,
    ...overrides,
  };
}

describe('AdOptimizationRecommendationsService', () => {
  const createMany = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const update = vi.fn();
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const prisma = {
    adOptimizationRecommendation: { createMany, findFirst, findMany, update },
  } as unknown as Pick<ServerPrisma, 'adOptimizationRecommendation'>;
  const service = new AdOptimizationRecommendationsService(prisma, logger);

  beforeEach(() => {
    vi.clearAllMocks();
    createMany.mockResolvedValue({ count: 1 });
  });

  describe('createBatch', () => {
    it('persists the canonical organization id for every recommendation', async () => {
      await service.createBatch([
        {
          entityId: 'ad-1',
          organizationId: 'org-1',
          recommendationType: 'pause',
        },
      ]);

      expect(createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            organizationId: 'org-1',
          }),
        ],
        skipDuplicates: true,
      });
    });

    it('rejects recommendations without canonical tenant ownership', async () => {
      await expect(
        service.createBatch([
          {
            entityId: 'ad-1',
            recommendationType: 'pause',
          },
        ]),
      ).rejects.toThrowError(
        'Ad optimization recommendation organizationId is required',
      );
      expect(createMany).not.toHaveBeenCalled();
    });

    it('logs and rethrows persistence failures', async () => {
      const dbError = new Error('insert failed');
      createMany.mockRejectedValue(dbError);

      await expect(
        service.createBatch([{ organizationId: 'org-1' }]),
      ).rejects.toBe(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('findByOrganization', () => {
    it('scopes the query to the tenant and soft-delete filter', async () => {
      findMany.mockResolvedValue([]);

      await service.findByOrganization('org-1', { limit: 10, offset: 5 });

      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 10,
        where: { isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('filters by status and recommendation type before pagination', async () => {
      findMany.mockResolvedValue([
        makeRow(
          { recommendationType: 'pause', status: 'pending' },
          { id: 'rec-1' },
        ),
      ]);

      const docs = await service.findByOrganization('org-1', {
        recommendationType: 'pause',
        status: 'pending',
      });

      expect(docs).toHaveLength(1);
      expect(docs[0]?.id).toBe('rec-1');
      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
        where: {
          AND: [
            { data: { equals: 'pending', path: ['status'] } },
            {
              data: {
                equals: 'pause',
                path: ['recommendationType'],
              },
            },
          ],
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });
  });

  describe('findById', () => {
    it('returns the projected document scoped to the tenant', async () => {
      findFirst.mockResolvedValue(
        makeRow({
          entityId: 'ad-1',
          entityName: 'Ad One',
          entityType: 'ad',
          expiresAt: '2026-08-10T00:00:00.000Z',
          metrics: { ctr: 0.5 },
          runDate: NOW,
          runId: 'run-1',
          status: 'pending',
          suggestedAction: { budgetIncreasePct: 20 },
        }),
      );

      const doc = await service.findById('rec-1', 'org-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'rec-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(doc).toMatchObject({
        entityId: 'ad-1',
        entityName: 'Ad One',
        entityType: 'ad',
        expiresAt: '2026-08-10T00:00:00.000Z',
        id: 'rec-1',
        metrics: { ctr: 0.5 },
        runDate: NOW,
        runId: 'run-1',
        status: 'pending',
        suggestedAction: { budgetIncreasePct: 20 },
      });
    });

    it('returns null when the recommendation is outside the tenant', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.findById('rec-1', 'org-2')).resolves.toBeNull();
    });
  });

  describe('status transitions', () => {
    it('approves a pending recommendation', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'pending' }));
      update.mockResolvedValue(makeRow({ status: 'approved' }));

      const doc = await service.approve('rec-1', 'org-1');

      expect(update).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({ status: 'approved' }),
        },
        where: { id: 'rec-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(doc?.status).toBe('approved');
    });

    it('rejects a pending recommendation with a persisted reason', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'pending' }));
      update.mockResolvedValue(
        makeRow({ reason: 'not relevant', status: 'rejected' }),
      );

      const doc = await service.reject('rec-1', 'org-1', 'not relevant');

      expect(update).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({
            reason: 'not relevant',
            status: 'rejected',
          }),
        },
        where: { id: 'rec-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(doc?.status).toBe('rejected');
      expect(doc?.reason).toBe('not relevant');
    });

    it('marks an approved recommendation as executed', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'approved' }));
      update.mockResolvedValue(makeRow({ status: 'executed' }));

      const doc = await service.markExecuted('rec-1', 'org-1');

      expect(doc?.status).toBe('executed');
    });

    it('refuses a transition from an unexpected status', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'rejected' }));

      await expect(service.approve('rec-1', 'org-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('returns null when the recommendation does not exist in the tenant', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.approve('rec-1', 'org-1')).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('logs and rethrows unexpected persistence failures', async () => {
      const dbError = new Error('update failed');
      findFirst.mockResolvedValue(makeRow({ status: 'pending' }));
      update.mockRejectedValue(dbError);

      await expect(service.approve('rec-1', 'org-1')).rejects.toBe(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('patchReviewStatus', () => {
    it('routes approved review patches through approve', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'pending' }));
      update.mockResolvedValue(makeRow({ status: 'approved' }));

      const doc = await service.patchReviewStatus('rec-1', 'org-1', 'approved');

      expect(doc?.status).toBe('approved');
    });

    it('routes rejected review patches through reject with the reason', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'pending' }));
      update.mockResolvedValue(
        makeRow({ reason: 'off-brand', status: 'rejected' }),
      );

      const doc = await service.patchReviewStatus(
        'rec-1',
        'org-1',
        'rejected',
        'off-brand',
      );

      expect(update).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({
            reason: 'off-brand',
            status: 'rejected',
          }),
        },
        where: { id: 'rec-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(doc?.status).toBe('rejected');
    });
  });

  describe('expireStale', () => {
    it('expires only pending recommendations past their expiry', async () => {
      const rows = [
        makeRow(
          { expiresAt: '2020-01-01T00:00:00.000Z', status: 'pending' },
          { id: 'rec-expired-string' },
        ),
        makeRow(
          {
            expiresAt: new Date('2020-06-01T00:00:00.000Z'),
            status: 'pending',
          },
          { id: 'rec-expired-date' },
        ),
      ];
      findMany.mockResolvedValue(rows);
      findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          rows.find((row) => row.id === where.id) ?? null,
      );
      update.mockImplementation(({ where }: { where: { id: string } }) =>
        makeRow({ status: 'expired' }, { id: where.id }),
      );

      const count = await service.expireStale();

      expect(count).toBe(2);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { data: { equals: 'pending', path: ['status'] } },
            {
              data: {
                lt: expect.any(String),
                path: ['expiresAt'],
              },
            },
          ],
          isDeleted: false,
        },
      });
      expect(update).toHaveBeenCalledTimes(2);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('expired 2 stale recommendations'),
      );
    });

    it('returns zero without logging when nothing is stale', async () => {
      findMany.mockResolvedValue([]);

      await expect(service.expireStale()).resolves.toBe(0);
      expect(update).not.toHaveBeenCalled();
      expect(logger.log).not.toHaveBeenCalled();
    });

    it('logs and rethrows scan failures', async () => {
      const dbError = new Error('scan failed');
      findMany.mockRejectedValue(dbError);

      await expect(service.expireStale()).rejects.toBe(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('findExistingPending', () => {
    it('finds the pending recommendation for the entity and type', async () => {
      findFirst.mockResolvedValue(
        makeRow(
          { entityId: 'ad-1', recommendationType: 'pause', status: 'pending' },
          { id: 'rec-pending' },
        ),
      );

      const doc = await service.findExistingPending('org-1', 'ad-1', 'pause');

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { data: { equals: 'ad-1', path: ['entityId'] } },
            {
              data: { equals: 'pause', path: ['recommendationType'] },
            },
            { data: { equals: 'pending', path: ['status'] } },
          ],
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(doc?.id).toBe('rec-pending');
    });

    it('returns null when no pending recommendation matches', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.findExistingPending('org-1', 'ad-1', 'pause'),
      ).resolves.toBeNull();
    });
  });
});
