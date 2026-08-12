import { WorkflowNodeClaimService } from '@api/collections/workflows/services/workflow-node-claim.service';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowNodeClaimService (#2359)', () => {
  const workflowNodeClaim = {
    create: vi.fn(),
    findFirst: vi.fn(),
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
    workflowNodeClaim.findFirst.mockResolvedValue({
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

    expect(workflowNodeClaim.findFirst).toHaveBeenCalledWith({
      where: {
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      },
    });
  });

  it('scopes the P2002 re-read to organizationId (tenant guard)', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue({
      error: null,
      output: null,
      status: 'running',
    });

    await service.tryClaim({
      executionId: 'exec-1',
      nodeId: 'publish',
      organizationId: 'org-tenant-a',
    });

    expect(workflowNodeClaim.findFirst).toHaveBeenCalledWith({
      where: {
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-tenant-a',
      },
    });
  });

  it('skips with running when another worker still owns the node', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue({
      error: null,
      output: null,
      status: 'running',
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
      output: undefined,
      status: 'running',
    });
  });

  it('skips with failed and surfaces the stored error', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue({
      error: 'publish timed out',
      output: null,
      status: 'failed',
    });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      action: 'skip',
      error: 'publish timed out',
      output: undefined,
      status: 'failed',
    });
  });

  it('re-claims when the unique conflict row is missing (race / purge)', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue(null);

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({ action: 'claimed' });

    expect(logger.warn).toHaveBeenCalledWith(
      'Workflow node claim unique conflict but row missing',
      expect.objectContaining({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    );
  });

  it('rethrows non-unique Prisma errors', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('Foreign key', {
      clientVersion: 'test',
      code: 'P2003',
    });
    workflowNodeClaim.create.mockRejectedValue(other);

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).rejects.toBe(other);
  });

  it('completes a claim with terminal status and output', async () => {
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await service.complete({
      executionId: 'exec-1',
      nodeId: 'publish',
      organizationId: 'org-1',
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
        organizationId: 'org-1',
      },
    });
  });

  it('completes a failed claim with error text and tenant-scoped where', async () => {
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await service.complete({
      error: 'node threw',
      executionId: 'exec-1',
      nodeId: 'publish',
      organizationId: 'org-1',
      status: 'failed',
    });

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith({
      data: {
        error: 'node threw',
        output: undefined,
        status: 'failed',
      },
      where: {
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      },
    });
  });
});
