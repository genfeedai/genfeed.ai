import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import { sumPersistedNodeCredits } from './workflow-node-credits';

describe('sumPersistedNodeCredits', () => {
  it('sums persisted node-result credits for a tenant execution', async () => {
    const prisma = {
      workflowExecutionNodeResult: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { creditsUsed: 12 } }),
      },
    };

    await expect(
      sumPersistedNodeCredits(prisma as never, 'execution-1', 'org-1'),
    ).resolves.toBe(12);
    expect(prisma.workflowExecutionNodeResult.aggregate).toHaveBeenCalledWith({
      _sum: { creditsUsed: true },
      where: {
        executionId: 'execution-1',
        organizationId: 'org-1',
        status: {
          in: [WorkflowExecutionStatus.COMPLETED, 'completed'],
        },
      },
    });
  });

  it('returns 0 when completed nodes have no persisted credits', async () => {
    const prisma = {
      workflowExecutionNodeResult: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { creditsUsed: null } }),
      },
    };

    await expect(
      sumPersistedNodeCredits(prisma as never, 'execution-1', 'org-1'),
    ).resolves.toBe(0);
  });
});
