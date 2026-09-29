import { StalePendingSystemExecutionFinderService } from '@api/collections/workflow-executions/services/stale-pending-system-execution-finder.service';
import { describe, expect, it, vi } from 'vitest';

describe('StalePendingSystemExecutionFinderService', () => {
  it('queries PENDING system-workflow rows within the staleness window', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'execution-1', organizationId: 'org-1' }]);
    const prisma = { workflowExecution: { findMany } };
    const service = new StalePendingSystemExecutionFinderService(
      prisma as never,
    );
    const staleBefore = new Date('2026-09-26T11:55:00.000Z');
    const createdAfter = new Date('2026-09-25T12:00:00.000Z');

    const result = await service.findMany(staleBefore, createdAfter);

    expect(result).toEqual([{ id: 'execution-1', organizationId: 'org-1' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        where: expect.objectContaining({
          createdAt: { gte: createdAfter, lt: staleBefore },
          isDeleted: false,
          result: {
            path: ['metadata', 'isSystemAction'],
            equals: true,
          },
          status: 'PENDING',
        }),
      }),
    );
  });

  it('excludes a row older than createdAfter from findMany — that cohort goes through findManyAncient instead', async () => {
    // The where clause itself does the filtering in production; this test
    // pins the exact bounds passed to Prisma so the lower bound can't
    // silently regress back to unbounded.
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { workflowExecution: { findMany } };
    const service = new StalePendingSystemExecutionFinderService(
      prisma as never,
    );
    const staleBefore = new Date('2026-09-26T11:55:00.000Z');
    const createdAfter = new Date('2026-09-25T11:55:00.000Z');

    await service.findMany(staleBefore, createdAfter);

    const where = findMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(createdAfter);
    expect(where.createdAt.lt).toEqual(staleBefore);
  });

  describe('keyset cursor pagination (#5319)', () => {
    it('has no cursor condition on the first page', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );

      await service.findMany(new Date('2026-09-26T00:00:00.000Z'), new Date(0));

      const where = findMany.mock.calls[0][0].where;
      expect(where.AND).toBeUndefined();
      expect(where.createdAt).toEqual({
        gte: new Date(0),
        lt: new Date('2026-09-26T00:00:00.000Z'),
      });
    });
  });

  describe('findManyAncient (#5252 review)', () => {
    it('queries PENDING system-workflow rows older than createdBefore, with no lower bound', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([{ id: 'execution-old', organizationId: 'org-1' }]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const createdBefore = new Date('2026-09-25T11:55:00.000Z');

      const result = await service.findManyAncient(createdBefore);

      expect(result).toEqual([
        { id: 'execution-old', organizationId: 'org-1' },
      ]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: createdBefore },
            isDeleted: false,
            result: {
              path: ['metadata', 'isSystemAction'],
              equals: true,
            },
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('lap upper-boundary snapshot (#5319 second review)', () => {
    it('findUpperBoundary returns the last matching row ordered createdAt/id descending', async () => {
      const boundaryRow = {
        createdAt: new Date('2026-09-26T11:50:00.000Z'),
        id: 'execution-199',
      };
      const findMany = vi.fn().mockResolvedValue([boundaryRow]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const staleBefore = new Date('2026-09-26T11:55:00.000Z');
      const createdAfter = new Date('2026-09-25T12:00:00.000Z');

      const result = await service.findUpperBoundary(staleBefore, createdAfter);

      expect(result).toEqual(boundaryRow);
      expect(findMany).toHaveBeenCalledWith({
        select: { createdAt: true, id: true },
        take: 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: {
          createdAt: { gte: createdAfter, lt: staleBefore },
          isDeleted: false,
          result: { path: ['metadata', 'isSystemAction'], equals: true },
          status: 'PENDING',
        },
      });
    });

    it('findUpperBoundaryAncient queries the ancient cohort with no lower bound', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const createdBefore = new Date('2026-09-25T11:55:00.000Z');

      await service.findUpperBoundaryAncient(createdBefore);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          where: expect.objectContaining({ createdAt: { lt: createdBefore } }),
        }),
      );
    });

    it('combines cursor and upperBoundary as two independent AND conditions', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const cursor = {
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
        id: 'execution-050',
      };
      const upperBoundary = {
        createdAt: new Date('2026-09-25T18:00:00.000Z'),
        id: 'execution-199',
      };

      await service.findMany(new Date(), new Date(0), {
        cursor,
        upperBoundary,
      });

      const where = findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(3);
      expect(where.AND[1]).toEqual({
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          {
            AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }],
          },
        ],
      });
      expect(where.AND[2]).toEqual({
        OR: [
          { createdAt: { lt: upperBoundary.createdAt } },
          {
            AND: [
              { createdAt: upperBoundary.createdAt },
              { id: { lte: upperBoundary.id } },
            ],
          },
        ],
      });
    });
  });
});
