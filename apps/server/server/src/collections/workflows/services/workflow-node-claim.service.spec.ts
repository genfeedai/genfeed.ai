import { Prisma } from '@genfeedai/prisma';
import {
  WORKFLOW_NODE_CLAIM_HEARTBEAT_MS,
  WORKFLOW_NODE_CLAIM_LEASE_MS,
} from '@server/collections/workflows/services/workflow-executor.constants';
import { WorkflowNodeClaimService } from '@server/collections/workflows/services/workflow-node-claim.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowNodeClaimService (#2359)', () => {
  const expectedClaim = (nodeId = 'publish') => ({
    action: 'claimed',
    lease: {
      executionId: 'exec-1',
      leaseOwnerId: expect.any(String),
      nodeId,
      organizationId: 'org-1',
    },
  });
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
    ).resolves.toEqual(expectedClaim());

    expect(workflowNodeClaim.create).toHaveBeenCalledWith({
      data: {
        executionId: 'exec-1',
        leaseExpiresAt: expect.any(Date),
        leaseOwnerId: expect.any(String),
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
      updatedAt: new Date(),
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
      updatedAt: new Date(),
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

  it('atomically reclaims a failed node for execution retry', async () => {
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
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual(expectedClaim());

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith({
      data: {
        error: null,
        leaseExpiresAt: expect.any(Date),
        leaseOwnerId: expect.any(String),
        output: Prisma.DbNull,
        status: 'running',
      },
      where: {
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
        status: 'failed',
      },
    });
  });

  it('atomically reclaims a running node whose lease is stale', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    const expiredAt = new Date(Date.now() - 1);
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue({
      error: 'worker terminated',
      leaseExpiresAt: expiredAt,
      output: { partial: true },
      status: 'running',
      updatedAt: new Date(),
    });
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual(expectedClaim());

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith({
      data: {
        error: null,
        leaseExpiresAt: expect.any(Date),
        leaseOwnerId: expect.any(String),
        output: Prisma.DbNull,
        status: 'running',
      },
      where: {
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
        status: 'running',
        leaseExpiresAt: { lte: expect.any(Date) },
      },
    });
  });

  it('reclaims legacy running claims by updatedAt when no lease expiry exists', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue({
      error: null,
      leaseExpiresAt: null,
      output: null,
      status: 'running',
      updatedAt: new Date(Date.now() - WORKFLOW_NODE_CLAIM_LEASE_MS - 1),
    });
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual(expectedClaim());

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leaseExpiresAt: null,
          updatedAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('returns the winning worker state when a stale reclaim loses its race', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst
      .mockResolvedValueOnce({
        error: 'worker terminated',
        leaseExpiresAt: new Date(Date.now() - 1),
        output: { partial: true },
        status: 'running',
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        error: null,
        output: null,
        status: 'running',
        updatedAt: new Date(),
      });
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 0 });

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

  it('leaves stale provider-callback claims to continuation recovery', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst.mockResolvedValue({
      error: null,
      output: null,
      status: 'running',
      updatedAt: new Date(Date.now() - WORKFLOW_NODE_CLAIM_LEASE_MS - 1),
    });

    await expect(
      service.tryClaim({
        executionId: 'exec-1',
        nodeId: 'videoGen',
        organizationId: 'org-1',
        isStaleRunningReclaimEnabled: false,
      }),
    ).resolves.toEqual({
      action: 'skip',
      error: undefined,
      output: undefined,
      status: 'running',
    });

    expect(workflowNodeClaim.updateMany).not.toHaveBeenCalled();
  });

  it('returns the winning worker state when a failed reclaim loses its race', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique', {
      clientVersion: 'test',
      code: 'P2002',
    });
    workflowNodeClaim.create.mockRejectedValue(conflict);
    workflowNodeClaim.findFirst
      .mockResolvedValueOnce({
        error: 'publish timed out',
        output: null,
        status: 'failed',
      })
      .mockResolvedValueOnce({
        error: null,
        output: null,
        status: 'running',
      });
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 0 });

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

  it('fails closed when the unique conflict row is missing', async () => {
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
    ).rejects.toThrow('disappeared after a unique conflict');

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

  it('renews an active claim only for its current owner and tenant', async () => {
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.renewLease({
        executionId: 'exec-1',
        leaseOwnerId: 'owner-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith({
      data: { leaseExpiresAt: expect.any(Date) },
      where: {
        executionId: 'exec-1',
        leaseOwnerId: 'owner-1',
        nodeId: 'publish',
        organizationId: 'org-1',
        status: 'running',
      },
    });
  });

  it('heartbeats while a synchronous node remains active', async () => {
    vi.useFakeTimers();
    try {
      workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });
      let finishOperation!: (value: string) => void;
      const operation = new Promise<string>((resolve) => {
        finishOperation = resolve;
      });
      const running = service.runWithLeaseHeartbeat(
        {
          executionId: 'exec-1',
          leaseOwnerId: 'owner-1',
          nodeId: 'publish',
          organizationId: 'org-1',
        },
        () => operation,
      );

      await vi.advanceTimersByTimeAsync(WORKFLOW_NODE_CLAIM_HEARTBEAT_MS);

      expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ leaseOwnerId: 'owner-1' }),
        }),
      );
      finishOperation('done');
      await expect(running).resolves.toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when a heartbeat observes that lease ownership was lost', async () => {
    vi.useFakeTimers();
    try {
      workflowNodeClaim.updateMany.mockResolvedValue({ count: 0 });
      let finishOperation!: () => void;
      const operation = new Promise<void>((resolve) => {
        finishOperation = resolve;
      });
      const running = service.runWithLeaseHeartbeat(
        {
          executionId: 'exec-1',
          leaseOwnerId: 'owner-1',
          nodeId: 'publish',
          organizationId: 'org-1',
        },
        () => operation,
      );

      await vi.advanceTimersByTimeAsync(WORKFLOW_NODE_CLAIM_HEARTBEAT_MS);
      finishOperation();

      await expect(running).rejects.toThrow(
        'Workflow node claim lease lost for exec-1/publish',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts the operation and rejects once repeated heartbeat failures exceed the lease window (#4307)', async () => {
    vi.useFakeTimers();
    try {
      workflowNodeClaim.updateMany.mockRejectedValue(new Error('db blip'));
      let finishOperation!: () => void;
      let capturedSignal: AbortSignal | undefined;
      const operation = new Promise<void>((resolve) => {
        finishOperation = resolve;
      });
      const running = service.runWithLeaseHeartbeat(
        {
          executionId: 'exec-1',
          leaseOwnerId: 'owner-1',
          nodeId: 'publish',
          organizationId: 'org-1',
        },
        (signal) => {
          capturedSignal = signal;
          return operation;
        },
      );

      // Three heartbeat ticks (10 min each) exhaust the 30-minute lease
      // window with every renewal failing.
      await vi.advanceTimersByTimeAsync(WORKFLOW_NODE_CLAIM_LEASE_MS);

      expect(capturedSignal?.aborted).toBe(true);
      finishOperation();

      await expect(running).rejects.toThrow(
        'Workflow node claim lease lost for exec-1/publish',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the lease when a single heartbeat failure is followed by a successful renewal before expiry (#4307)', async () => {
    vi.useFakeTimers();
    try {
      workflowNodeClaim.updateMany
        .mockRejectedValueOnce(new Error('db blip'))
        .mockResolvedValue({ count: 1 });
      let finishOperation!: (value: string) => void;
      let capturedSignal: AbortSignal | undefined;
      const operation = new Promise<string>((resolve) => {
        finishOperation = resolve;
      });
      const running = service.runWithLeaseHeartbeat(
        {
          executionId: 'exec-1',
          leaseOwnerId: 'owner-1',
          nodeId: 'publish',
          organizationId: 'org-1',
        },
        (signal) => {
          capturedSignal = signal;
          return operation;
        },
      );

      // First heartbeat fails transiently, well inside the lease window.
      await vi.advanceTimersByTimeAsync(WORKFLOW_NODE_CLAIM_HEARTBEAT_MS);
      // Second heartbeat succeeds and resets the lease clock.
      await vi.advanceTimersByTimeAsync(WORKFLOW_NODE_CLAIM_HEARTBEAT_MS);

      expect(capturedSignal?.aborted).toBe(false);
      finishOperation('done');
      await expect(running).resolves.toBe('done');
    } finally {
      vi.useRealTimers();
    }
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
        leaseExpiresAt: null,
        leaseOwnerId: null,
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
        leaseExpiresAt: null,
        leaseOwnerId: null,
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

  it('completes only the claim still owned by the caller', async () => {
    workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

    await service.complete({
      executionId: 'exec-1',
      leaseOwnerId: 'owner-1',
      nodeId: 'publish',
      organizationId: 'org-1',
      status: 'completed',
    });

    expect(workflowNodeClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          executionId: 'exec-1',
          leaseOwnerId: 'owner-1',
          nodeId: 'publish',
          organizationId: 'org-1',
          status: 'running',
        },
      }),
    );
  });
});
