import { WorkflowNodeClaimService } from '@api/collections/workflows/services/workflow-node-claim.service';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowNodeClaimService (#2359)', () => {
  const workflowNodeClaim = {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowNodeClaimService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowNodeClaimService(
      { workflowNodeClaim } as never,
      logger as never,
    );
  });

  it('claims a first insert for (executionId, nodeId)', async () => {
    workflowNodeClaim.create.mockResolvedValue({ id: 'claim-1' });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({ action: 'claimed' });

    expect(workflowNodeClaim.create).toHaveBeenCalledWith({
      data: {
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
        status: 'running',
      },
    });
  });

  it('duplicate insert loses cleanly and returns the stored completed row', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findUnique.mockResolvedValue({
      error: null,
      output: { postId: 'p1' },
      status: 'completed',
    });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      action: 'skip',
      error: undefined,
      output: { postId: 'p1' },
      status: 'completed',
    });
  });

  it('completes a claim with terminal status and output', async () => {
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await service.complete({
      executionId: 'exec-1',
      nodeId: 'publish',
      output: { postId: 'p1' },
      status: 'completed',
    });

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith({
      data: {
        error: null,
        output: { postId: 'p1' },
        status: 'completed',
      },
      where: {
        executionId: 'exec-1',
        nodeId: 'publish',
      },
    });
  });
});
