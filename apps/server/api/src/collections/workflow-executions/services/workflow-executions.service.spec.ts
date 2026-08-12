import {
  ActionOrigin,
  WorkflowExecutionStatus as SharedWorkflowExecutionStatus,
} from '@genfeedai/enums';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { runWithActionOrigin } from '@genfeedai/server';
import { WorkflowExecutionsService } from './workflow-executions.service';

describe('WorkflowExecutionsService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const makeService = () => {
    const workflowExecution = {
      create: vi.fn().mockResolvedValue({ id: 'execution-1' }),
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        organizationId: 'org-1',
        result: {},
        startedAt: new Date('2026-06-29T00:00:00.000Z'),
        trigger: 'manual',
        workflowId: 'workflow-1',
      }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'execution-1' }),
    };

    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([]),
      workflowExecution,
    };

    const workflowEventWebhookService = {
      emitExecutionOutcome: vi.fn().mockResolvedValue(undefined),
    };

    return {
      prisma,
      service: new WorkflowExecutionsService(
        prisma as never,
        logger as never,
        workflowEventWebhookService as never,
      ),
      workflowEventWebhookService,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes Prisma workflow execution statuses with database enum casing', async () => {
    const { prisma, service } = makeService();

    await service.createExecution('user-1', 'org-1', {
      trigger: 'scheduled',
      workflowId: 'workflow-1',
    });
    await service.startExecution('execution-1');
    await service.completeExecution('execution-1');
    await service.completeExecution('execution-1', 'failed');
    await service.cancelExecution('execution-1');

    expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creditsUsed: 0,
          progress: 0,
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

  it('stores trusted action provenance with workflow execution metadata', async () => {
    const { prisma, service } = makeService();

    await runWithActionOrigin(
      {
        actorUserId: 'user-1',
        apiKeyId: 'key-1',
        origin: ActionOrigin.MCP,
      },
      () =>
        service.createExecution('user-1', 'org-1', {
          metadata: { origin: ActionOrigin.UI, surface: 'mcp-tool' },
          workflowId: 'workflow-1',
        }),
    );

    expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            metadata: {
              actorUserId: 'user-1',
              apiKeyId: 'key-1',
              origin: ActionOrigin.MCP,
              surface: 'mcp-tool',
            },
          }),
        }),
      }),
    );
  });

  it('serializes executions without provenance with explicit unknown origin', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findFirst.mockResolvedValue({
      id: 'execution-without-provenance',
      result: { metadata: { surface: 'unknown-origin' } },
    });

    await expect(
      service.findOne({ id: 'execution-without-provenance' }),
    ).resolves.toMatchObject({
      metadata: {
        origin: ActionOrigin.UNKNOWN,
        surface: 'unknown-origin',
      },
    });
  });

  it('exposes scalar and child-table execution state through the canonical document', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findFirst.mockResolvedValue({
      creditsUsed: 7,
      durationMs: 1200,
      failedNodeId: 'node-2',
      id: 'execution-1',
      nodeResults: [
        {
          nodeId: 'node-2',
          nodeType: 'generate',
          status: SharedWorkflowExecutionStatus.FAILED,
        },
      ],
      progress: 50,
      result: {
        inputValues: { prompt: 'Launch' },
        metadata: { phase: 'failed' },
      },
      trigger: 'manual',
    });

    await expect(service.findOne({ id: 'execution-1' })).resolves.toMatchObject(
      {
        creditsUsed: 7,
        durationMs: 1200,
        failedNodeId: 'node-2',
        inputValues: { prompt: 'Launch' },
        metadata: { origin: ActionOrigin.UNKNOWN, phase: 'failed' },
        nodeResults: [
          {
            nodeId: 'node-2',
            nodeType: 'generate',
            status: SharedWorkflowExecutionStatus.FAILED,
          },
        ],
        progress: 50,
        trigger: 'manual',
      },
    );
  });

  it('counts execution stats from scalar duration columns', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        durationMs: 1000,
        status: PrismaWorkflowExecutionStatus.COMPLETED,
      },
      {
        durationMs: 3000,
        status: PrismaWorkflowExecutionStatus.COMPLETED,
      },
      {
        durationMs: null,
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
      select: { durationMs: true, status: true },
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        workflowId: 'workflow-1',
      },
    });
  });

  it('completes executions with scalar progress and ETA columns, not result JSON', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      estimatedDurationMs: 1000,
      result: {},
      startedAt: new Date('2026-06-29T00:00:00.000Z'),
      workflowId: 'workflow-1',
    });

    await service.completeExecution('execution-1');

    expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      select: {
        estimatedDurationMs: true,
        organizationId: true,
        startedAt: true,
        trigger: true,
        workflowId: true,
      },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          etaCurrentPhase: 'Completed',
          progress: 100,
          remainingDurationMs: 0,
          status: PrismaWorkflowExecutionStatus.COMPLETED,
        }),
        where: { id: 'execution-1' },
      }),
    );
    expect(
      prisma.workflowExecution.update.mock.calls[0]?.[0]?.data,
    ).not.toHaveProperty('result');
  });

  it('emits a terminal workflow execution webhook for both outcomes', async () => {
    const { prisma, service, workflowEventWebhookService } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      creditsUsed: 12,
      failedNodeId: 'node-3',
      organizationId: 'org-1',
      result: {},
      startedAt: new Date('2026-06-29T00:00:00.000Z'),
      trigger: 'scheduled',
      workflowId: 'workflow-1',
    });
    prisma.workflowExecution.update.mockResolvedValue({
      creditsUsed: 12,
      failedNodeId: 'node-3',
      id: 'execution-1',
    });

    await service.completeExecution('execution-1');
    await service.completeExecution('execution-1', 'Provider timed out');

    expect(
      workflowEventWebhookService.emitExecutionOutcome,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        creditsUsed: 12,
        errorMessage: null,
        executionId: 'execution-1',
        organizationId: 'org-1',
        progress: 100,
        status: SharedWorkflowExecutionStatus.COMPLETED,
        trigger: 'scheduled',
        workflowId: 'workflow-1',
      }),
    );
    expect(
      workflowEventWebhookService.emitExecutionOutcome,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        errorMessage: 'Provider timed out',
        failedNodeId: 'node-3',
        status: SharedWorkflowExecutionStatus.FAILED,
      }),
    );
  });

  it('upserts one child node result without rewriting execution.result', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'execution-1',
        progress: 50,
      },
    ]);

    await expect(
      service.updateNodeResult(
        'execution-1',
        {
          nodeId: 'node-1',
          nodeType: 'input',
          status: SharedWorkflowExecutionStatus.COMPLETED,
        },
        2,
      ),
    ).resolves.toEqual({
      id: 'execution-1',
      metadata: {},
      progress: 50,
    });

    const query = prisma.$queryRaw.mock.calls[0]?.[0] as readonly string[];
    const sql = query.join('?').replace(/\s+/g, ' ').trim();

    expect(sql).toContain('INSERT INTO workflow_execution_node_results');
    expect(sql).toContain(
      'ON CONFLICT ("executionId", "nodeId") DO UPDATE SET',
    );
    expect(sql).toContain('UPDATE workflow_executions AS execution');
    expect(sql).toContain('RETURNING execution.id, execution.progress');
    expect(sql).not.toContain('jsonb_array_elements');
    expect(sql).not.toContain('execution.result');
    expect(prisma.workflowExecution.findUnique).not.toHaveBeenCalled();
    expect(prisma.workflowExecution.update).not.toHaveBeenCalled();
  });

  it('reads scalar runtime state for delay resume ETA updates', async () => {
    const { prisma, service } = makeService();
    const startedAt = new Date('2026-06-29T00:00:00.000Z');
    prisma.workflowExecution.findUnique.mockResolvedValue({
      estimatedDurationMs: 12_000,
      etaCurrentPhase: 'Waiting',
      isDeleted: false,
      progress: 37,
      result: { metadata: { surface: 'delay' } },
      startedAt,
    });

    await expect(service.getRuntimeState('execution-1')).resolves.toEqual({
      metadata: {
        eta: {
          currentPhase: 'Waiting',
          estimatedDurationMs: 12_000,
        },
        surface: 'delay',
      },
      progress: 37,
      startedAt,
    });
    expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
      select: {
        creditsUsed: true,
        durationMs: true,
        estimatedDurationMs: true,
        etaConfidence: true,
        etaCurrentPhase: true,
        etaUpdatedAt: true,
        failedNodeId: true,
        isDeleted: true,
        progress: true,
        remainingDurationMs: true,
        result: true,
        startedAt: true,
      },
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

  it('patches credits and failed node as independent scalar columns', async () => {
    const { prisma, service } = makeService();

    await service.setFailedNodeId('execution-1', 'node-1');
    await service.setCreditsUsed('execution-1', 17);

    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(1, {
      data: { failedNodeId: 'node-1' },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.update).toHaveBeenNthCalledWith(2, {
      data: { creditsUsed: 17 },
      where: { id: 'execution-1' },
    });
    expect(prisma.workflowExecution.findUnique).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('returns null when the atomic metadata update misses', async () => {
    const { prisma, service } = makeService();

    await expect(
      service.updateExecutionMetadata('missing-execution', { phase: 'queued' }),
    ).resolves.toBeNull();

    expect(prisma.workflowExecution.findUnique).not.toHaveBeenCalled();
    expect(prisma.workflowExecution.update).not.toHaveBeenCalled();
  });

  it('updates execution metadata without returning the result blob', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'execution-1',
        progress: 20,
      },
    ]);

    await expect(
      service.updateExecutionMetadata('execution-1', { phase: 'running' }),
    ).resolves.toEqual({
      id: 'execution-1',
      metadata: { phase: 'running' },
      progress: 20,
    });

    const query = prisma.$queryRaw.mock.calls[0]?.[0] as readonly string[];
    const sql = query.join('?').replace(/\s+/g, ' ').trim();

    expect(sql).toContain('UPDATE workflow_executions AS execution');
    expect(sql).toContain("'{metadata}'");
    expect(sql).toContain('WHERE execution.id = ?');
    expect(sql).toContain('RETURNING execution.id, execution.progress');
    expect(sql).not.toContain('RETURNING execution.id, execution.result');
    expect(prisma.workflowExecution.findUnique).not.toHaveBeenCalled();
  });

  it('writes ETA snapshots onto scalar columns without returning result JSON', async () => {
    const { prisma, service } = makeService();
    prisma.workflowExecution.update.mockResolvedValue({
      id: 'execution-1',
      progress: 40,
    });

    await expect(
      service.updateExecutionProgress('execution-1', {
        eta: {
          currentPhase: 'Running image',
          estimatedDurationMs: 20_000,
          remainingDurationMs: 12_000,
        },
        progress: 40,
      }),
    ).resolves.toEqual({
      id: 'execution-1',
      metadata: {
        eta: {
          currentPhase: 'Running image',
          estimatedDurationMs: 20_000,
          remainingDurationMs: 12_000,
        },
      },
      progress: 40,
    });

    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          etaCurrentPhase: 'Running image',
          estimatedDurationMs: 20_000,
          progress: 40,
          remainingDurationMs: 12_000,
        }),
        select: { id: true, progress: true },
        where: { id: 'execution-1' },
      }),
    );
  });

  it('preserves concurrent creditsUsed and failedNodeId under terminal completion', async () => {
    const { prisma, service, workflowEventWebhookService } = makeService();
    prisma.workflowExecution.findUnique.mockResolvedValue({
      creditsUsed: 0,
      failedNodeId: null,
      organizationId: 'org-1',
      result: {},
      startedAt: new Date('2026-06-29T00:00:00.000Z'),
      trigger: 'manual',
      workflowId: 'workflow-1',
    });
    prisma.workflowExecution.update.mockResolvedValue({
      creditsUsed: 17,
      failedNodeId: 'node-1',
      id: 'execution-1',
    });

    await Promise.all([
      service.setCreditsUsed('execution-1', 17),
      service.setFailedNodeId('execution-1', 'node-1'),
      service.completeExecution('execution-1', 'Provider timed out', {
        creditsUsed: 17,
        failedNodeId: 'node-1',
      }),
    ]);

    const completionWrite = prisma.workflowExecution.update.mock.calls.find(
      (call) => call[0]?.data?.status === PrismaWorkflowExecutionStatus.FAILED,
    )?.[0];

    expect(completionWrite?.data).toEqual(
      expect.objectContaining({
        creditsUsed: 17,
        failedNodeId: 'node-1',
        progress: 100,
        status: PrismaWorkflowExecutionStatus.FAILED,
      }),
    );
    expect(completionWrite?.data).not.toHaveProperty('result');
    expect(
      workflowEventWebhookService.emitExecutionOutcome,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsUsed: 17,
        failedNodeId: 'node-1',
        status: SharedWorkflowExecutionStatus.FAILED,
      }),
    );
  });
});
