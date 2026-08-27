import { WorkflowEngineConverterService } from '@server/collections/workflows/services/workflow-engine-converter.service';
import {
  EXECUTABLE_WORKFLOW_SELECT,
  WorkflowExecutorService,
} from '@server/collections/workflows/services/workflow-executor.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type {
  ExecutableWorkflow,
  NodeExecutionResult,
} from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const converter = new WorkflowEngineConverterService();

describe('WorkflowExecutorService', () => {
  const prisma = {
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workflowNodeClaim: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const engineAdapter = {
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
    updateExecutionProgress: vi.fn(),
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
    prisma.workflowNodeClaim.create.mockResolvedValue({ id: 'claim-1' });
    prisma.workflowNodeClaim.findFirst.mockResolvedValue(null);
    prisma.workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });

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
    const executedWorkflows: ExecutableWorkflow[] = [];
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
    executionsService.updateExecutionProgress.mockResolvedValue({
      id: 'execution-1',
      progress: 50,
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
        executedWorkflows.push(workflow);
        const node = workflow.nodes.find((candidate) => !candidate.isLocked);
        if (!node) {
          throw new Error('Expected one executable node');
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
    const publishWorkflow = executedWorkflows.find((workflow) =>
      workflow.nodes.some(
        (candidate) => candidate.id === 'publish-node' && !candidate.isLocked,
      ),
    );
    if (!publishWorkflow) {
      throw new Error('Expected the publish-node execution workflow');
    }
    expect(
      publishWorkflow.nodes.find(
        (candidate) => candidate.id === '__input_content',
      )?.cachedOutput,
    ).toEqual(firstOutput);
    expect(publishWorkflow.edges).toContainEqual(
      expect.objectContaining({
        source: '__input_content',
        target: 'publish-node',
        targetHandle: 'content',
      }),
    );
    expect(executionsService.createExecution).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        inputValues: { topic: 'launch' },
        workflowId: 'workflow-1',
      }),
    );
    expect(executionsService.startExecution).toHaveBeenCalledWith(
      'execution-1',
    );
    expect(executionsService.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      undefined,
      { creditsUsed: 3 },
    );
    expect(executionsService.setCreditsUsed).not.toHaveBeenCalled();
    expect(
      websocketService.publishBackgroundTaskUpdate,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        progress: 100,
        resultId: 'execution-1',
        status: 'completed',
        taskId: 'execution-1',
      }),
    );
  });

  it('executes a 1-node prompt through the live Run path and records a node result', async () => {
    const workflowDoc = {
      config: {},
      edges: [],
      id: 'workflow-prompt',
      inputVariables: [],
      label: 'Curie prompt',
      metadata: {},
      nodes: [
        {
          data: { label: 'Prompt', prompt: 'Write a FUD News brief' },
          id: 'PyHRz6uB',
          type: 'prompt',
        },
      ],
      organizationId: 'org-1',
      steps: [],
      userId: 'user-1',
    };

    prisma.workflow.findFirst.mockResolvedValue(workflowDoc);
    prisma.workflow.update.mockResolvedValue({ id: 'workflow-prompt' });
    engineAdapter.convertToExecutableWorkflow.mockImplementation((doc) =>
      converter.convertToExecutableWorkflow(doc),
    );
    engineAdapter.applyRuntimeInputValues.mockImplementation(
      (doc, workflow, values) =>
        converter.applyRuntimeInputValues(doc, workflow, values),
    );
    executionsService.createExecution.mockResolvedValue({
      id: 'execution-prompt',
    });
    executionsService.startExecution.mockResolvedValue({
      id: 'execution-prompt',
    });
    executionsService.findOne.mockResolvedValue({
      id: 'execution-prompt',
      result: {},
    });
    executionsService.updateExecutionMetadata.mockResolvedValue({
      id: 'execution-prompt',
    });
    executionsService.updateExecutionProgress.mockResolvedValue({
      id: 'execution-prompt',
      progress: 100,
    });
    executionsService.updateNodeResult.mockResolvedValue({
      id: 'execution-prompt',
      progress: 100,
    });
    executionsService.completeExecution.mockResolvedValue({
      id: 'execution-prompt',
      metadata: {},
    });

    engineAdapter.executeWorkflow.mockImplementation(
      async (workflow: ExecutableWorkflow) => {
        const node = workflow.nodes.find((candidate) => !candidate.isLocked);
        if (!node) {
          return {
            completedAt: new Date(),
            nodeResults: new Map(),
            runId: 'execution-prompt',
            startedAt: new Date(),
            status: 'completed' as const,
            totalCreditsUsed: 0,
            workflowId: workflow.id,
          };
        }

        const nodeResult: NodeExecutionResult = {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: node.id,
          output: String(node.config.prompt ?? ''),
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed',
        };

        return {
          completedAt: new Date(),
          nodeResults: new Map([[node.id, nodeResult]]),
          runId: 'execution-prompt',
          startedAt: new Date(),
          status: 'completed' as const,
          totalCreditsUsed: 0,
          workflowId: workflow.id,
        };
      },
    );

    const result = await service.executeManualWorkflow(
      'workflow-prompt',
      'user-1',
      'org-1',
    );

    expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(result.nodeResults).toEqual([
      expect.objectContaining({
        nodeId: 'PyHRz6uB',
        output: 'Write a FUD News brief',
        status: WorkflowExecutionStatus.COMPLETED,
      }),
    ]);
    expect(engineAdapter.executeWorkflow).toHaveBeenCalledTimes(1);
    expect(executionsService.updateNodeResult).toHaveBeenCalledWith(
      'execution-prompt',
      expect.objectContaining({
        nodeId: 'PyHRz6uB',
        nodeType: 'prompt',
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
    expect(executionsService.updateExecutionProgress).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({
        eta: expect.objectContaining({
          currentPhase: 'Running Next node',
          estimatedDurationMs: 123_456,
        }),
      }),
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

  describe('continueExistingExecution (#2359)', () => {
    const triggerEvent = {
      data: { source: 'retry' },
      organizationId: 'org-1',
      platform: 'twitter',
      type: 'mention',
      userId: 'user-1',
    };

    it('returns a failed shell when the execution row is missing', async () => {
      executionsService.findOne.mockResolvedValue(null);

      const result = await service.continueExistingExecution(
        'missing-exec',
        triggerEvent,
      );

      expect(result).toEqual(
        expect.objectContaining({
          executionId: 'missing-exec',
          status: WorkflowExecutionStatus.FAILED,
          workflowId: '',
        }),
      );
      expect(executionsService.findOne).toHaveBeenCalledWith({
        id: 'missing-exec',
        organizationId: 'org-1',
      });
      expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
    });

    it('no-ops when the prior execution already completed', async () => {
      executionsService.findOne.mockResolvedValue({
        completedAt: new Date('2026-08-12T10:00:00.000Z'),
        id: 'exec-1',
        startedAt: new Date('2026-08-12T09:00:00.000Z'),
        status: WorkflowExecutionStatus.COMPLETED,
        workflowId: 'workflow-1',
      });

      const result = await service.continueExistingExecution(
        'exec-1',
        triggerEvent,
      );

      expect(result).toEqual(
        expect.objectContaining({
          executionId: 'exec-1',
          status: WorkflowExecutionStatus.COMPLETED,
          workflowId: 'workflow-1',
        }),
      );
      expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
      expect(executionsService.createExecution).not.toHaveBeenCalled();
    });

    it('no-ops when the prior execution was cancelled', async () => {
      executionsService.findOne.mockResolvedValue({
        completedAt: new Date('2026-08-12T10:05:00.000Z'),
        id: 'exec-1',
        startedAt: new Date('2026-08-12T09:00:00.000Z'),
        status: WorkflowExecutionStatus.CANCELLED,
        workflowId: 'workflow-1',
      });

      const result = await service.continueExistingExecution(
        'exec-1',
        triggerEvent,
      );

      expect(result).toEqual(
        expect.objectContaining({
          executionId: 'exec-1',
          status: WorkflowExecutionStatus.CANCELLED,
          workflowId: 'workflow-1',
        }),
      );
      expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
      expect(executionsService.startExecution).not.toHaveBeenCalled();
      expect(executionsService.createExecution).not.toHaveBeenCalled();
    });

    it('re-enters a PENDING prior execution under the same id', async () => {
      const executableWorkflow: ExecutableWorkflow = {
        edges: [],
        id: 'workflow-1',
        lockedNodeIds: [],
        nodes: [
          {
            config: {},
            id: 'action-node',
            inputs: [],
            label: 'Action',
            type: 'action',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      executionsService.findOne.mockResolvedValue({
        id: 'exec-pending',
        status: WorkflowExecutionStatus.PENDING,
        workflowId: 'workflow-1',
      });
      prisma.workflow.findFirst.mockResolvedValue({
        config: {},
        edges: [],
        id: 'workflow-1',
        inputVariables: [],
        label: 'Pending resume',
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
      executionsService.startExecution.mockResolvedValue({
        id: 'exec-pending',
      });
      executionsService.updateExecutionMetadata.mockResolvedValue({
        id: 'exec-pending',
      });
      executionsService.updateNodeResult.mockResolvedValue({
        id: 'exec-pending',
        progress: 100,
      });
      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        nodeResults: new Map(),
        runId: 'exec-pending',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 0,
        workflowId: 'workflow-1',
      });
      executionsService.completeExecution.mockResolvedValue({
        id: 'exec-pending',
        metadata: {},
      });

      const result = await service.continueExistingExecution(
        'exec-pending',
        triggerEvent,
      );

      expect(executionsService.createExecution).not.toHaveBeenCalled();
      expect(executionsService.startExecution).toHaveBeenCalledWith(
        'exec-pending',
      );
      expect(result.executionId).toBe('exec-pending');
      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'workflow-1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('re-enters the same execution id without creating a new row when failed', async () => {
      const executableWorkflow: ExecutableWorkflow = {
        edges: [],
        id: 'workflow-1',
        lockedNodeIds: [],
        nodes: [
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

      executionsService.findOne.mockResolvedValue({
        id: 'exec-1',
        status: WorkflowExecutionStatus.FAILED,
        workflowId: 'workflow-1',
      });
      prisma.workflow.findFirst.mockResolvedValue({
        config: {},
        edges: [],
        id: 'workflow-1',
        inputVariables: [],
        label: 'Retry workflow',
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
      executionsService.startExecution.mockResolvedValue({ id: 'exec-1' });
      executionsService.updateExecutionMetadata.mockResolvedValue({
        id: 'exec-1',
      });
      executionsService.updateNodeResult.mockResolvedValue({
        id: 'exec-1',
        progress: 100,
      });
      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        nodeResults: new Map([
          [
            'publish-node',
            {
              completedAt: new Date(),
              creditsUsed: 0,
              nodeId: 'publish-node',
              output: { ok: true },
              retryCount: 0,
              startedAt: new Date(),
              status: 'completed',
            } satisfies NodeExecutionResult,
          ],
        ]),
        runId: 'exec-1',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 0,
        workflowId: 'workflow-1',
      });
      executionsService.completeExecution.mockResolvedValue({
        id: 'exec-1',
        metadata: {},
      });

      const result = await service.continueExistingExecution(
        'exec-1',
        triggerEvent,
      );

      expect(executionsService.createExecution).not.toHaveBeenCalled();
      expect(executionsService.startExecution).toHaveBeenCalledWith('exec-1');
      expect(result.executionId).toBe('exec-1');
      expect(result.workflowId).toBe('workflow-1');
    });
  });
});
