import { WorkflowExecutionStatus as SharedWorkflowExecutionStatus } from '@genfeedai/enums';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { WorkflowExecutionsService } from './workflow-executions.service';

describe('WorkflowExecutionsService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const makeService = () => {
    const workflowExecution = {
      create: vi.fn().mockResolvedValue({ id: 'execution-1' }),
      findUnique: vi.fn().mockResolvedValue({
        result: {},
        startedAt: new Date('2026-06-29T00:00:00.000Z'),
        workflowId: 'workflow-1',
      }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'execution-1' }),
    };

    const prisma = {
      workflowExecution,
    };

    return {
      prisma,
      service: new WorkflowExecutionsService(prisma as never, logger as never),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes Prisma workflow execution statuses with database enum casing', async () => {
    const { prisma, service } = makeService();

    await service.createExecution('user-1', 'org-1', {
      trigger: 'scheduled',
      workflow: 'workflow-1',
    });
    await service.startExecution('execution-1');
    await service.completeExecution('execution-1');
    await service.completeExecution('execution-1', 'failed');
    await service.cancelExecution('execution-1');

    expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrismaWorkflowExecutionStatus.PENDING,
        }),
      }),
    );
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrismaWorkflowExecutionStatus.RUNNING,
        }),
      }),
    );
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrismaWorkflowExecutionStatus.COMPLETED,
        }),
      }),
    );
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrismaWorkflowExecutionStatus.FAILED,
        }),
      }),
    );
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrismaWorkflowExecutionStatus.CANCELLED,
        }),
      }),
    );
  });

  it('counts execution stats using Prisma enum casing from database rows', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        result: { durationMs: 1000 },
        status: PrismaWorkflowExecutionStatus.COMPLETED,
      },
      {
        result: { durationMs: 3000 },
        status: PrismaWorkflowExecutionStatus.COMPLETED,
      },
      {
        result: {},
        status: PrismaWorkflowExecutionStatus.FAILED,
      },
    ]);

    await expect(
      service.getExecutionStats('workflow-1', 'org-1'),
    ).resolves.toEqual({
      avgDurationMs: 2000,
      completed: 2,
      failed: 1,
      total: 3,
    });
    expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith({
      select: { result: true, status: true },
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        workflowId: 'workflow-1',
      },
    });
  });

  it('completes executions with a narrow unique read before merging result JSON', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      result: {
        metadata: {
          eta: {
            estimatedDurationMs: 1000,
          },
        },
      },
      startedAt: new Date('2026-06-29T00:00:00.000Z'),
      workflowId: 'workflow-1',
    });

    await service.completeExecution('execution-1');

    expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      select: { result: true, startedAt: true, workflowId: true },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            metadata: expect.objectContaining({
              eta: expect.objectContaining({
                currentPhase: 'Completed',
                remainingDurationMs: 0,
              }),
            }),
            progress: 100,
          }),
          status: PrismaWorkflowExecutionStatus.COMPLETED,
        }),
        where: { id: 'execution-1' },
      }),
    );
  });

  it('updates node results by reading only the result column', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      result: {
        metadata: { retained: true },
        nodeResults: [
          {
            nodeId: 'node-1',
            nodeType: 'input',
            status: SharedWorkflowExecutionStatus.RUNNING,
          },
        ],
      },
    });

    await service.updateNodeResult(
      'execution-1',
      {
        nodeId: 'node-1',
        nodeType: 'input',
        status: SharedWorkflowExecutionStatus.COMPLETED,
      },
      2,
    );

    expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      select: { result: true },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            metadata: { retained: true },
            nodeResults: [
              {
                nodeId: 'node-1',
                nodeType: 'input',
                status: SharedWorkflowExecutionStatus.COMPLETED,
              },
            ],
            progress: 50,
          }),
        }),
        select: { id: true, result: true },
        where: { id: 'execution-1' },
      }),
    );
  });

  it('reads only runtime state needed for delay resume ETA updates', async () => {
    const { prisma, service } = makeService();
    const startedAt = new Date('2026-06-29T00:00:00.000Z');
    prisma.workflowExecution.findUnique.mockResolvedValue({
      isDeleted: false,
      result: {
        metadata: {
          eta: {
            currentPhase: 'Waiting',
            estimatedDurationMs: 12_000,
          },
        },
        progress: 37,
      },
      startedAt,
    });

    await expect(service.getRuntimeState('execution-1')).resolves.toEqual({
      metadata: {
        eta: {
          currentPhase: 'Waiting',
          estimatedDurationMs: 12_000,
        },
      },
      progress: 37,
      startedAt,
    });
    expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      select: { isDeleted: true, result: true, startedAt: true },
      where: { id: 'execution-1' },
    });
  });

  it('treats deleted execution runtime state as missing', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      isDeleted: true,
      result: { progress: 50 },
      startedAt: new Date('2026-06-29T00:00:00.000Z'),
    });

    await expect(service.getRuntimeState('execution-1')).resolves.toBeNull();
  });

  it('narrows result-only void patch updates to the id return field', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      result: { metadata: { retained: true } },
    });

    await service.setFailedNodeId('execution-1', 'node-1');
    await service.setCreditsUsed('execution-1', 17);

    expect(prisma.workflowExecution.findUnique).toHaveBeenNthCalledWith(1, {
      select: { result: true },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(1, {
      data: {
        result: {
          failedNodeId: 'node-1',
          metadata: { retained: true },
        },
      },
      select: { id: true },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.findUnique).toHaveBeenNthCalledWith(2, {
      select: { result: true },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(2, {
      data: {
        result: {
          creditsUsed: 17,
          metadata: { retained: true },
        },
      },
      select: { id: true },
      where: { id: 'execution-1' },
    });
  });

  it('skips result patch updates when the narrow unique read misses', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue(null);

    await expect(
      service.updateExecutionMetadata('missing-execution', { phase: 'queued' }),
    ).resolves.toBeNull();

    expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      select: { result: true },
      where: { id: 'missing-execution' },
    });
    expect(prisma.workflowExecution.update).not.toHaveBeenCalled();
  });

  it('updates execution metadata with a narrow return payload', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      result: { metadata: { retained: true }, progress: 20 },
    });

    await service.updateExecutionMetadata('execution-1', { phase: 'running' });

    expect(prisma.workflowExecution.update).toHaveBeenCalledWith({
      data: {
        result: {
          metadata: {
            phase: 'running',
            retained: true,
          },
          progress: 20,
        },
      },
      select: { id: true, result: true },
      where: { id: 'execution-1' },
    });
  });
});
