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

  it('applies the caller-provided limit', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { workflowExecution: { findMany } };
    const service = new StalePendingSystemExecutionFinderService(
      prisma as never,
    );

    await service.findMany(new Date(), new Date(0), 50);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
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

    it('applies the caller-provided limit', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );

      await service.findManyAncient(new Date(), 25);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });
  });
});
