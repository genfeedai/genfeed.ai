import { StalePendingSystemExecutionFinderService } from '@api/collections/workflow-executions/services/stale-pending-system-execution-finder.service';
import { describe, expect, it, vi } from 'vitest';

describe('StalePendingSystemExecutionFinderService', () => {
  it('queries PENDING system-workflow rows older than the given timestamp', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'execution-1', organizationId: 'org-1' }]);
    const prisma = { workflowExecution: { findMany } };
    const service = new StalePendingSystemExecutionFinderService(
      prisma as never,
    );
    const staleBefore = new Date('2026-09-26T11:55:00.000Z');

    const result = await service.findMany(staleBefore);

    expect(result).toEqual([{ id: 'execution-1', organizationId: 'org-1' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: staleBefore },
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

    await service.findMany(new Date(), 50);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
