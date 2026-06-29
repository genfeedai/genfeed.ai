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
      findFirst: vi.fn().mockResolvedValue({
        id: 'execution-1',
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
  });
});
