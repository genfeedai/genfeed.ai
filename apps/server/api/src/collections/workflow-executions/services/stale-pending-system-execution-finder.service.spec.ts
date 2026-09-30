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

  it('applies the caller-provided limit', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { workflowExecution: { findMany } };
    const service = new StalePendingSystemExecutionFinderService(
      prisma as never,
    );

    await service.findMany(new Date(), new Date(0), { limit: 50 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
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

    it('resumes strictly after the cursor row instead of restarting from the top', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const staleBefore = new Date('2026-09-26T00:00:00.000Z');
      const createdAfter = new Date(0);
      const cursor = {
        createdAt: new Date('2026-09-25T12:00:00.000Z'),
        id: 'execution-200',
      };

      await service.findMany(staleBefore, createdAfter, { cursor });

      const where = findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        expect.objectContaining({
          createdAt: { gte: createdAfter, lt: staleBefore },
        }),
        {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            {
              AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }],
            },
          ],
        },
      ]);
    });

    it('keeps the same-createdAt tiebreaker so two rows sharing a timestamp are never both skipped or both repeated', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const tiedCreatedAt = new Date('2026-09-25T12:00:00.000Z');

      await service.findMany(new Date(), new Date(0), {
        cursor: { createdAt: tiedCreatedAt, id: 'execution-a' },
      });

      const where = findMany.mock.calls[0][0].where;
      const tiebreak = where.AND[1].OR[1];
      expect(tiebreak).toEqual({
        AND: [{ createdAt: tiedCreatedAt }, { id: { gt: 'execution-a' } }],
      });
    });

    it('orders by createdAt then id ascending so a cursor tuple resumes deterministically', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );

      await service.findManyAncient(new Date());

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('selects createdAt and cancelRequestedAt so the caller can build the next cursor and honour a drain cancellation intent (#5450)', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );

      await service.findMany(new Date(), new Date(0));

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            cancelRequestedAt: true,
            createdAt: true,
            id: true,
            organizationId: true,
          },
        }),
      );
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

    it('applies the caller-provided limit', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );

      await service.findManyAncient(new Date(), { limit: 25 });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });

    it('resumes an ancient sweep strictly after the cursor row', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const cursor = {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'execution-ancient-200',
      };

      await service.findManyAncient(new Date('2026-09-25T11:55:00.000Z'), {
        cursor,
      });

      const where = findMany.mock.calls[0][0].where;
      expect(where.AND[1]).toEqual({
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          {
            AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }],
          },
        ],
      });
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

    it('findUpperBoundary returns undefined when the cohort currently has no candidates', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );

      const result = await service.findUpperBoundary(new Date(), new Date(0));

      expect(result).toBeUndefined();
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

    it('caps a page to rows at or before the upper boundary tuple', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { workflowExecution: { findMany } };
      const service = new StalePendingSystemExecutionFinderService(
        prisma as never,
      );
      const staleBefore = new Date('2026-09-26T00:00:00.000Z');
      const createdAfter = new Date(0);
      const upperBoundary = {
        createdAt: new Date('2026-09-25T18:00:00.000Z'),
        id: 'execution-199',
      };

      await service.findMany(staleBefore, createdAfter, { upperBoundary });

      const where = findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        expect.objectContaining({
          createdAt: { gte: createdAfter, lt: staleBefore },
        }),
        {
          OR: [
            { createdAt: { lt: upperBoundary.createdAt } },
            {
              AND: [
                { createdAt: upperBoundary.createdAt },
                { id: { lte: upperBoundary.id } },
              ],
            },
          ],
        },
      ]);
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
  describe('findStalledInteractiveAgentTurns (#5622)', () => {
    it('selects only PENDING, non-drained INTERACTIVE agent-conversation runs, oldest first, within the window', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const service = new StalePendingSystemExecutionFinderService({
        workflowExecution: { findMany },
      } as never);
      const createdBefore = new Date('2026-09-29T10:58:00.000Z');
      const createdAfter = new Date('2026-09-28T11:00:00.000Z');

      await service.findStalledInteractiveAgentTurns(
        createdBefore,
        createdAfter,
        50,
      );

      const args = findMany.mock.calls[0][0];
      expect(args.take).toBe(50);
      expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      const [base, dispatch, canonical] = args.where.AND;
      expect(base).toEqual(
        expect.objectContaining({
          cancelRequestedAt: null,
          createdAt: { gte: createdAfter, lt: createdBefore },
          isDeleted: false,
          status: 'PENDING',
        }),
      );
      expect(dispatch).toEqual({
        result: { equals: 'interactive', path: ['metadata', 'dispatchClass'] },
      });
      expect(canonical.OR.map((clause: never) => clause)).toEqual(
        [
          'agent.turn.execute',
          'agent.thread.ui-action',
          'agent.thread.input-response',
        ].map((canonicalId) => ({
          result: { equals: canonicalId, path: ['metadata', 'canonicalId'] },
        })),
      );
    });
  });
});
