import {
  EXECUTABLE_WORKFLOW_SELECT,
  WorkflowExecutorService,
} from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  ExecutableWorkflow,
  NodeExecutionResult,
} from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowExecutorService', () => {
  const prisma = {
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const engineAdapter = {
    applyScheduledDigestCharge: vi.fn(),
    applyRuntimeInputValues: vi.fn(),
    convertToExecutableWorkflow: vi.fn(),
    executeWorkflow: vi.fn(),
  };
  const executionsService = {
    completeExecution: vi.fn(),
    createExecution: vi.fn(),
    findOne: vi.fn(),
    getRuntimeState: vi.fn(),
    setCreditsUsed: vi.fn(),
    setFailedNodeId: vi.fn(),
    startExecution: vi.fn(),
    updateExecutionMetadata: vi.fn(),
    updateNodeResult: vi.fn(),
  };
  const websocketService = {
    emit: vi.fn(),
    publishBackgroundTaskUpdate: vi.fn(),
    publishWorkflowStatus: vi.fn(),
  };

  let service: WorkflowExecutorService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new WorkflowExecutorService(
      prisma as never,
      logger as never,
      engineAdapter as never,
      executionsService as never,
      websocketService as never,
    );
  });

  it('executes a multi-node manual workflow through persistence and completion', async () => {
    const firstOutput = { draft: 'Ready to publish' };
    const executableWorkflow: ExecutableWorkflow = {
      edges: [
        {
          id: 'draft-publish',
          source: 'draft-node',
          target: 'publish-node',
          targetHandle: 'content',
        },
      ],
      id: 'workflow-1',
      lockedNodeIds: [],
      nodes: [
        {
          config: {},
          id: 'draft-node',
          inputs: [],
          label: 'Draft',
          type: 'generate',
        },
        {
          config: {},
          id: 'publish-node',
          inputs: [],
          label: 'Publish',
          type: 'publish',
        },
      ],
      organizationId: 'org-1',
      userId: 'user-1',
    };

    prisma.workflow.findFirst.mockResolvedValue({
      config: {},
      edges: executableWorkflow.edges,
      id: 'workflow-1',
      inputVariables: [],
      label: 'Multi-node workflow',
      metadata: {},
      mongoId: null,
      nodes: [],
      organizationId: 'org-1',
      steps: [],
      userId: 'user-1',
    });
    prisma.workflow.update.mockResolvedValue({ id: 'workflow-1' });
    engineAdapter.convertToExecutableWorkflow.mockReturnValue(
      executableWorkflow,
    );
    engineAdapter.applyRuntimeInputValues.mockReturnValue(executableWorkflow);
    executionsService.createExecution.mockResolvedValue({ id: 'execution-1' });
    executionsService.startExecution.mockResolvedValue({
      id: 'execution-1',
    });
    executionsService.updateExecutionMetadata.mockResolvedValue({
      id: 'execution-1',
    });
    executionsService.updateNodeResult.mockResolvedValue({
      id: 'execution-1',
      progress: 50,
    });
    executionsService.completeExecution.mockResolvedValue({
      id: 'execution-1',
      metadata: {},
    });

    engineAdapter.executeWorkflow.mockImplementation(
      async (workflow: ExecutableWorkflow) => {
        const node = workflow.nodes.find((candidate) => !candidate.isLocked);
        if (!node) {
          throw new Error('Expected one executable node');
        }

        if (node.id === 'publish-node') {
          const virtualInput = workflow.nodes.find(
            (candidate) => candidate.id === '__input_content',
          );
          expect(virtualInput?.cachedOutput).toEqual(firstOutput);
          expect(workflow.edges).toContainEqual(
            expect.objectContaining({
              source: '__input_content',
              target: 'publish-node',
              targetHandle: 'content',
            }),
          );
        }

        const nodeResult: NodeExecutionResult = {
          completedAt: new Date(),
          creditsUsed: node.id === 'draft-node' ? 2 : 1,
          nodeId: node.id,
          output:
            node.id === 'draft-node'
              ? firstOutput
              : { published: true, source: firstOutput.draft },
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed',
        };

        return {
          completedAt: new Date(),
          nodeResults: new Map([[node.id, nodeResult]]),
          runId: 'execution-1',
          startedAt: new Date(),
          status: 'completed' as const,
          totalCreditsUsed: nodeResult.creditsUsed,
          workflowId: workflow.id,
        };
      },
    );

    const result = await service.executeManualWorkflow(
      'workflow-1',
      'user-1',
      'org-1',
      { topic: 'launch' },
    );

    expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(result.totalCreditsUsed).toBe(3);
    expect(result.nodeResults).toEqual([
      expect.objectContaining({
        nodeId: 'draft-node',
        output: firstOutput,
        status: WorkflowExecutionStatus.COMPLETED,
      }),
      expect.objectContaining({
        nodeId: 'publish-node',
        output: { published: true, source: firstOutput.draft },
        status: WorkflowExecutionStatus.COMPLETED,
      }),
    ]);
    expect(engineAdapter.executeWorkflow).toHaveBeenCalledTimes(2);
    expect(executionsService.createExecution).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        inputValues: { topic: 'launch' },
        workflow: 'workflow-1',
      }),
    );
    expect(executionsService.startExecution).toHaveBeenCalledWith(
      'execution-1',
    );
    expect(executionsService.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      undefined,
    );
    expect(executionsService.setCreditsUsed).toHaveBeenCalledWith(
      'execution-1',
      3,
    );
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        progress: 100,
        resultId: 'execution-1',
        status: 'completed',
        taskId: 'execution-1',
      }),
    );
  });

  it('reuses the previous ETA duration when resuming after a delay', async () => {
    const startedAt = new Date();
    const executableWorkflow = {
      edges: [{ source: 'completed-node', target: 'next-node' }],
      id: 'workflow-1',
      nodes: [
        { id: 'completed-node', label: 'Completed node', type: 'trigger' },
        { id: 'next-node', label: 'Next node', type: 'post' },
      ],
    };

    prisma.workflow.findFirst.mockResolvedValue({
      config: {},
      edges: [],
      id: 'workflow-1',
      inputVariables: [],
      label: 'Delayed workflow',
      metadata: {},
      nodes: [],
      organizationId: 'org-1',
      steps: [],
      userId: 'user-1',
    });
    engineAdapter.convertToExecutableWorkflow.mockReturnValue(
      executableWorkflow,
    );
    engineAdapter.applyRuntimeInputValues.mockReturnValue(executableWorkflow);
    executionsService.getRuntimeState.mockResolvedValue({
      metadata: {
        eta: {
          currentPhase: 'Waiting to resume',
          estimatedDurationMs: 123_456,
        },
      },
      progress: 40,
      startedAt,
    });
    executionsService.updateNodeResult.mockResolvedValue({ progress: 55 });
    engineAdapter.executeWorkflow.mockImplementation(
      async (
        _workflow: unknown,
        options: {
          onNodeStatusChange: (event: {
            newStatus: string;
            nodeId: string;
          }) => Promise<void>;
        },
      ) => {
        await options.onNodeStatusChange({
          newStatus: 'running',
          nodeId: 'next-node',
        });

        return {
          nodeResults: new Map([
            [
              'next-node',
              {
                creditsUsed: 0,
                retryCount: 0,
                startedAt,
                status: 'running',
              },
            ],
          ]),
          status: 'running',
          totalCreditsUsed: 0,
        };
      },
    );

    await service.resumeAfterDelay({
      delayNodeId: 'delay-node',
      executionId: 'exec-1',
      nodeOutputCache: { 'completed-node': { value: 'done' } },
      organizationId: 'org-1',
      remainingNodeIds: ['next-node'],
      triggerEvent: {
        data: { source: 'webhook' },
        organizationId: 'org-1',
        platform: 'twitter',
        type: 'mention',
        userId: 'user-1',
      },
      userId: 'user-1',
      workflowId: 'workflow-1',
    });

    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      select: EXECUTABLE_WORKFLOW_SELECT,
      where: {
        id: 'workflow-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(executionsService.getRuntimeState).toHaveBeenCalledWith('exec-1');
    expect(executionsService.findOne).not.toHaveBeenCalled();
    expect(executionsService.updateExecutionMetadata).toHaveBeenCalledWith(
      'exec-1',
      {
        eta: expect.objectContaining({
          currentPhase: 'Running Next node',
          estimatedDurationMs: 123_456,
        }),
      },
    );
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedDurationMs: 123_456,
        progress: 55,
        status: 'processing',
        taskId: 'exec-1',
      }),
    );
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(executionsService.completeExecution).not.toHaveBeenCalled();
  });

  it('rejects stale agent scope before loading or executing a workflow', async () => {
    const scopeService = {
      assertConsequentialBoundary: vi
        .fn()
        .mockRejectedValue(new Error('Agent context is stale.')),
      assertResourceBrand: vi.fn(),
    };
    const scopedService = new WorkflowExecutorService(
      prisma as never,
      logger as never,
      engineAdapter as never,
      executionsService as never,
      websocketService as never,
      undefined,
      scopeService as never,
    );

    await expect(
      scopedService.executeManualWorkflow(
        'workflow-1',
        'user-1',
        'org-1',
        {},
        undefined,
        undefined,
        {
          brandId: 'brand-1',
          contextVersion: 2,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId: 'org-1',
          source: 'explicit',
          threadId: 'thread-1',
          userId: 'user-1',
        },
      ),
    ).rejects.toThrow('Agent context is stale.');

    expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
    expect(engineAdapter.executeWorkflow).not.toHaveBeenCalled();
  });

  it('revalidates durable agent scope before a delayed workflow resumes', async () => {
    const scopeService = {
      assertConsequentialBoundary: vi
        .fn()
        .mockRejectedValue(new Error('Agent context is stale.')),
      assertResourceBrand: vi.fn(),
    };
    const scopedService = new WorkflowExecutorService(
      prisma as never,
      logger as never,
      engineAdapter as never,
      executionsService as never,
      websocketService as never,
      undefined,
      scopeService as never,
    );
    prisma.workflow.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'workflow-1',
      organizationId: 'org-1',
    });
    executionsService.getRuntimeState.mockResolvedValue({
      metadata: {
        agentScope: {
          brandId: 'brand-1',
          contextVersion: 2,
          isLegacyFallback: false,
          organizationId: 'org-1',
          source: 'explicit',
          threadId: 'thread-1',
        },
      },
      progress: 40,
      startedAt: new Date(),
    });

    await expect(
      scopedService.resumeAfterDelay({
        delayNodeId: 'delay-node',
        executionId: 'exec-1',
        nodeOutputCache: {},
        organizationId: 'org-1',
        remainingNodeIds: ['next-node'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'manual',
          type: 'manual',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).rejects.toThrow('Agent context is stale.');

    expect(engineAdapter.executeWorkflow).not.toHaveBeenCalled();
  });
});
