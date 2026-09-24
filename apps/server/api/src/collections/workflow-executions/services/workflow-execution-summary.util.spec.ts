import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';
import { readWorkflowExecutionSummary } from './workflow-execution-summary.util';

describe('readWorkflowExecutionSummary', () => {
  it('counts all matching runs, independently of the history page, and uses completion-day bounds', async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        {
          status: WorkflowExecutionStatus.COMPLETED,
          _count: { _all: 45 },
          _sum: { creditsUsed: 90 },
        },
        {
          status: WorkflowExecutionStatus.FAILED,
          _count: { _all: 4 },
          _sum: { creditsUsed: 3 },
        },
        {
          status: WorkflowExecutionStatus.RUNNING,
          _count: { _all: 2 },
          _sum: { creditsUsed: null },
        },
        {
          status: WorkflowExecutionStatus.CANCELLED,
          _count: { _all: 1 },
          _sum: { creditsUsed: 0 },
        },
      ])
      .mockResolvedValueOnce([
        { status: WorkflowExecutionStatus.COMPLETED, _count: { _all: 3 } },
        { status: WorkflowExecutionStatus.FAILED, _count: { _all: 1 } },
      ]);
    const prisma = {
      workflowExecution: { groupBy },
    } as unknown as PrismaService;
    const where = { organizationId: 'org-1', isDeleted: false };
    const start = new Date('2026-09-23T22:00:00Z');
    const end = new Date('2026-09-24T22:00:00Z');
    expect(
      await readWorkflowExecutionSummary(prisma, where, start, end),
    ).toEqual({
      active: 2,
      completed: 45,
      completedToday: 3,
      failed: 4,
      failedToday: 1,
      total: 52,
      totalCredits: 93,
    });
    expect(groupBy).toHaveBeenNthCalledWith(1, {
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { creditsUsed: true },
    });
    expect(groupBy).toHaveBeenNthCalledWith(2, {
      by: ['status'],
      where: { ...where, completedAt: { gte: start, lt: end } },
      _count: { _all: true },
    });
  });
});
