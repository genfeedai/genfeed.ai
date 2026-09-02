import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/contracts';
import {
  createExecutableActionNode,
  type ExecutableWorkflow,
  type NodeExecutionResult,
} from '@genfeedai/workflows/engine';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const converter = new WorkflowEngineConverterService();
const WORKFLOW_VERSION_ID = 'workflow-version-1';

function currentVersion(input: {
  edges?: unknown[];
  inputVariables?: unknown[];
  lockedNodeIds?: string[];
  nodes?: unknown[];
}) {
  return {
    graph: {
      edges: input.edges ?? [],
      lockedNodeIds: input.lockedNodeIds ?? [],
      nodes: input.nodes ?? [],
    },
    id: WORKFLOW_VERSION_ID,
    inputSchema: input.inputVariables ?? [],
    version: 1,
  };
}

function pinnedVersion(input: {
  brandId?: string;
  edges?: unknown[];
  id: string;
  inputVariables?: unknown[];
  isDeleted?: boolean;
  label: string;
  nodes?: unknown[];
}) {
  const version = currentVersion(input);
  return {
    ...version,
    organizationId: 'org-1',
    userId: 'user-1',
    workflow: {
      brandId: input.brandId,
      config: {},
      description: null,
      id: input.id,
      isDeleted: input.isDeleted ?? false,
      label: input.label,
      metadata: {},
      organizationId: 'org-1',
      userId: 'user-1',
    },
  };
}

describe('WorkflowExecutorService', () => {
  const prisma = {
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workflowVersion: {
      findFirst: vi.fn(),
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
    executeNode: vi.fn(),
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

  it('executes an exact immutable tenant workflow version', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersion({
        id: 'workflow-1',
        label: 'Pinned workflow',
        nodes: [],
      }),
    );
    vi.spyOn(service, 'executeManualWorkflowDocument').mockResolvedValue({
      executionId: 'execution-1',
      nodeResults: [],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      totalCreditsUsed: 0,
      workflowId: 'workflow-1',
    });

    await expect(
      service.executePinnedManualWorkflow(
        'workflow-1',
        WORKFLOW_VERSION_ID,
        'user-1',
        'org-1',
        { ingredientId: 'ingredient-1' },
        { parentExecutionId: 'parent-1' },
      ),
    ).resolves.toMatchObject({
      execution: { executionId: 'execution-1' },
      workflowLabel: 'Pinned workflow',
    });
    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WORKFLOW_VERSION_ID, workflowId: 'workflow-1' },
      }),
    );
  });

  it('fails closed when the workflow/version tuple is unavailable to the tenant', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(null);

    await expect(
      service.executePinnedManualWorkflow(
        'workflow-1',
        'other-version',
        'user-1',
        'org-1',
      ),
    ).rejects.toThrow(
      'Workflow workflow-1 version other-version is unavailable in organization org-1',
    );
  });

  it('rejects a new manual run against a retired pinned workflow', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersion({
        id: 'workflow-1',
        isDeleted: true,
        label: 'Retired workflow',
      }),
    );

    await expect(
      service.executePinnedManualWorkflow(
        'workflow-1',
        WORKFLOW_VERSION_ID,
        'user-1',
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executionsService.createExecution).not.toHaveBeenCalled();
  });

  it('resolves a completed child by its durable idempotency key', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersion({ id: 'workflow-1', label: 'Pinned workflow', nodes: [] }),
    );
    executionsService.findOne.mockResolvedValue({
      completedAt: new Date(),
      creditsUsed: 2,
      id: 'existing-child',
      metadata: { parentExecutionId: 'parent-1' },
      nodeResults: [
        {
          creditsUsed: 2,
          nodeId: 'result',
          nodeType: 'generate',
          output: { ingredientId: 'output-1' },
          retryCount: 0,
          status: WorkflowExecutionStatus.COMPLETED,
        },
      ],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      trigger: WorkflowExecutionTrigger.API,
      workflowId: 'workflow-1',
      workflowVersionId: WORKFLOW_VERSION_ID,
    });
    const executeDocument = vi.spyOn(service, 'executeManualWorkflowDocument');

    await expect(
      service.executePinnedManualWorkflow(
        'workflow-1',
        WORKFLOW_VERSION_ID,
        'user-1',
        'org-1',
        { ingredientId: 'ingredient-1' },
        { parentExecutionId: 'parent-1' },
        'workflow-for-each:stable-key',
      ),
    ).resolves.toMatchObject({
      execution: {
        executionId: 'existing-child',
        nodeResults: [
          expect.objectContaining({ output: { ingredientId: 'output-1' } }),
        ],
      },
    });
    expect(executionsService.findOne).toHaveBeenCalledWith({
      idempotencyKey: 'workflow-for-each:stable-key',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(executeDocument).not.toHaveBeenCalled();
    expect(executionsService.createExecution).not.toHaveBeenCalled();
  });

  it('executes a multi-node manual workflow through persistence and completion', async () => {
    const firstOutput = { draft: 'Ready to publish' };
    const executedNodes: Array<{
      inputs: Map<string, unknown>;
      node: ExecutableNode;
    }> = [];
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
        createExecutableActionNode({
          actionId: 'llm',
          id: 'draft-node',
          label: 'Draft',
        }),
        createExecutableActionNode({
          actionId: 'publish',
          id: 'publish-node',
          label: 'Publish',
        }),
      ],
      organizationId: 'org-1',
      userId: 'user-1',
      versionId: WORKFLOW_VERSION_ID,
    };

    prisma.workflow.findFirst.mockResolvedValue({
      config: {},
      currentVersion: currentVersion({
        edges: executableWorkflow.edges,
        nodes: [],
      }),
      id: 'workflow-1',
      label: 'Multi-node workflow',
      metadata: {},
      organizationId: 'org-1',
      userId: 'user-1',
    });
    prisma.workflow.update.mockResolvedValue({ id: 'workflow-1' });
    // A fresh manual run has no prior execution to hydrate completed nodes from.
    executionsService.findOne.mockResolvedValue(null);
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

    engineAdapter.executeNode.mockImplementation(
      async (node: ExecutableNode, inputs: Map<string, unknown>) => {
        executedNodes.push({ inputs, node });
        return {
          completedAt: new Date(),
          creditsUsed: node.id === 'draft-node' ? 2 : 1,
          nodeId: node.id,
          output:
            node.id === 'draft-node'
              ? firstOutput
              : { published: true, source: firstOutput.draft },
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        };
      },
    );

    const result = await service.executeManualWorkflow(
      'workflow-1',
      'user-1',
      'org-1',
      { topic: 'launch' },
    );

    expect(result.error).toBeUndefined();
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
    expect(engineAdapter.executeNode).toHaveBeenCalledTimes(2);
    const publishCall = executedNodes.find(
      (entry) => entry.node.id === 'publish-node',
    );
    if (!publishCall) {
      throw new Error('Expected the publish-node execution');
    }
    expect(publishCall.inputs.get('content')).toEqual(firstOutput);
    expect(executionsService.createExecution).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        inputValues: { topic: 'launch' },
        workflowId: 'workflow-1',
        workflowVersionId: WORKFLOW_VERSION_ID,
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
    expect(prisma.workflow.update).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        executionCount: { increment: 1 },
      }),
      where: {
        id: 'workflow-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
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

    await service.executeManualWorkflow('workflow-1', 'user-1', 'org-1', {
      topic: 'second run',
    });

    expect(engineAdapter.executeNode).toHaveBeenCalledTimes(4);
  });

  it('tenant-scopes status updates when manual execution fails', async () => {
    const executableWorkflow: ExecutableWorkflow = {
      edges: [],
      id: 'workflow-failure',
      lockedNodeIds: [],
      nodes: [
        createExecutableActionNode({
          actionId: 'publish',
          id: 'publish-node',
          label: 'Publish',
        }),
      ],
      organizationId: 'org-1',
      userId: 'user-1',
      versionId: WORKFLOW_VERSION_ID,
    };

    prisma.workflow.findFirst.mockResolvedValue({
      config: {},
      currentVersion: currentVersion({ nodes: [] }),
      id: 'workflow-failure',
      label: 'Failing workflow',
      metadata: {},
      organizationId: 'org-1',
      userId: 'user-1',
    });
    prisma.workflow.update.mockResolvedValue({ id: 'workflow-failure' });
    executionsService.findOne.mockResolvedValue(null);
    engineAdapter.convertToExecutableWorkflow.mockReturnValue(
      executableWorkflow,
    );
    engineAdapter.applyRuntimeInputValues.mockReturnValue(executableWorkflow);
    executionsService.createExecution.mockResolvedValue({
      id: 'execution-failure',
    });
    executionsService.startExecution.mockRejectedValue(
      new Error('Failed to start execution'),
    );
    executionsService.completeExecution.mockResolvedValue({
      id: 'execution-failure',
      metadata: {},
    });
    await expect(
      service.executeManualWorkflow('workflow-failure', 'user-1', 'org-1'),
    ).rejects.toThrow('Failed to start execution');

    expect(prisma.workflow.update).toHaveBeenCalledTimes(1);
    expect(prisma.workflow.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: WorkflowStatus.FAILED }),
      where: {
        id: 'workflow-failure',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('surfaces the original failure when failure bookkeeping cannot write', async () => {
    const executableWorkflow: ExecutableWorkflow = {
      edges: [],
      id: 'workflow-bookkeeping',
      lockedNodeIds: [],
      nodes: [
        createExecutableActionNode({
          actionId: 'publish',
          id: 'publish-node',
          label: 'Publish',
        }),
      ],
      organizationId: 'org-1',
      userId: 'user-1',
      versionId: WORKFLOW_VERSION_ID,
    };

    prisma.workflow.findFirst.mockResolvedValue({
      config: {},
      currentVersion: currentVersion({ nodes: [] }),
      id: 'workflow-bookkeeping',
      label: 'Failing workflow',
      metadata: {},
      organizationId: 'org-1',
      userId: 'user-1',
    });
    executionsService.findOne.mockResolvedValue(null);
    engineAdapter.convertToExecutableWorkflow.mockReturnValue(
      executableWorkflow,
    );
    engineAdapter.applyRuntimeInputValues.mockReturnValue(executableWorkflow);
    executionsService.createExecution.mockResolvedValue({
      id: 'execution-bookkeeping',
    });
    executionsService.startExecution.mockRejectedValue(
      new Error('Replicate rejected the prompt'),
    );
    executionsService.completeExecution.mockResolvedValue({
      id: 'execution-bookkeeping',
      metadata: {},
    });
    prisma.workflow.update.mockRejectedValue(
      new Error('No record was found for an update'),
    );

    await expect(
      service.executeManualWorkflow('workflow-bookkeeping', 'user-1', 'org-1'),
    ).rejects.toThrow('Replicate rejected the prompt');
  });

  it('leaves the shared system-workflow mirror untouched on a system action', async () => {
    // The hidden system mirror is owned by the system principal, but every
    // caller executes it with its own organizationId on the runtime document.
    // Tenant-scoped bookkeeping against that row matches nothing (Prisma
    // P2025) and would fail the run before any node output reached the user.
    const executableWorkflow: ExecutableWorkflow = {
      edges: [],
      id: 'system-workflow-mirror',
      lockedNodeIds: [],
      nodes: [
        createExecutableActionNode({
          actionId: 'content.pipeline.generate-image',
          id: 'generate-node',
          label: 'Generate',
        }),
      ],
      organizationId: 'org-1',
      userId: 'user-1',
      versionId: WORKFLOW_VERSION_ID,
    };

    engineAdapter.convertToExecutableWorkflow.mockReturnValue(
      executableWorkflow,
    );
    engineAdapter.applyRuntimeInputValues.mockReturnValue(executableWorkflow);
    executionsService.findOne.mockResolvedValue(null);
    executionsService.createExecution.mockResolvedValue({
      id: 'execution-sys',
    });
    executionsService.startExecution.mockResolvedValue({ id: 'execution-sys' });
    executionsService.updateExecutionProgress.mockResolvedValue({
      id: 'execution-sys',
      progress: 100,
    });
    executionsService.updateNodeResult.mockResolvedValue({
      id: 'execution-sys',
      progress: 100,
    });
    executionsService.completeExecution.mockResolvedValue({
      id: 'execution-sys',
      metadata: {},
    });
    engineAdapter.executeNode.mockImplementation(
      async (node: ExecutableNode) => {
        return {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: node.id,
          output: { ingredientId: 'ingredient-1' },
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        };
      },
    );

    const result = await service.executeManualWorkflowDocument(
      {
        config: {},
        currentVersion: currentVersion({ nodes: [] }),
        edges: [],
        id: 'system-workflow-mirror',
        inputVariables: [],
        label: 'System image generation',
        metadata: {},
        nodes: [],
        // The mirror row itself belongs to the system principal.
        organizationId: 'system-principal',
        userId: 'system-principal',
      } as never,
      'user-1',
      'org-1',
      {},
      { canonicalId: 'generate-image', isSystemAction: true },
    );

    expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(prisma.workflow.update).not.toHaveBeenCalled();
  });

  it('executes a 1-node text generation through the live Run path and records a node result', async () => {
    const workflowDoc = {
      config: {},
      edges: [],
      id: 'workflow-prompt',
      inputVariables: [],
      label: 'Curie prompt',
      metadata: {},
      nodes: [
        {
          data: {
            config: {
              actionId: 'llm',
              parameters: { prompt: 'Write a FUD News brief' },
            },
            label: 'Prompt',
          },
          id: 'PyHRz6uB',
          type: 'genfeedAction',
        },
      ],
      organizationId: 'org-1',
      userId: 'user-1',
    };

    prisma.workflow.findFirst.mockResolvedValue({
      config: workflowDoc.config,
      currentVersion: currentVersion(workflowDoc),
      id: workflowDoc.id,
      label: workflowDoc.label,
      metadata: workflowDoc.metadata,
      organizationId: workflowDoc.organizationId,
      userId: workflowDoc.userId,
    });
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

    engineAdapter.executeNode.mockImplementation(
      async (node: ExecutableNode) => {
        return {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: node.id,
          output: String(
            (node.config.parameters as Record<string, unknown> | undefined)
              ?.prompt ?? '',
          ),
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
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
    expect(engineAdapter.executeNode).toHaveBeenCalledTimes(1);
    expect(executionsService.updateNodeResult).toHaveBeenCalledWith(
      'execution-prompt',
      // Node results record the action id, not the shared envelope type.
      expect.objectContaining({
        nodeId: 'PyHRz6uB',
        nodeType: 'llm',
      }),
    );
  });

  it('reuses the previous ETA duration when resuming after a delay', async () => {
    const startedAt = new Date();
    const executableWorkflow = {
      edges: [
        { source: 'completed-node', target: 'next-node' },
        { source: 'next-node', target: 'pause-node' },
      ],
      id: 'workflow-1',
      nodes: [
        {
          id: 'completed-node',
          label: 'Completed node',
          type: 'trigger-manual',
        },
        createExecutableActionNode({
          actionId: 'publish',
          id: 'next-node',
          label: 'Next node',
        }),
        {
          config: { delayMs: 60_000 },
          id: 'pause-node',
          inputs: [],
          label: 'Pause',
          type: 'delay',
        },
      ],
    };

    executionsService.findOne.mockResolvedValue({
      id: 'exec-1',
      workflowId: 'workflow-1',
      workflowVersionId: WORKFLOW_VERSION_ID,
    });
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersion({
        edges: [],
        id: 'workflow-1',
        label: 'Delayed workflow',
        nodes: [],
      }),
    );
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
    engineAdapter.executeNode.mockImplementation(
      async (node: ExecutableNode) => {
        const output =
          node.id === 'pause-node'
            ? {
                delayMs: 60_000,
                resumeAt: new Date(startedAt.getTime() + 60_000).toISOString(),
              }
            : { published: true };
        return {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: node.id,
          output,
          retryCount: 0,
          startedAt,
          status: 'completed' as const,
        };
      },
    );

    await service.resumeAfterDelay({
      delayNodeId: 'delay-node',
      executionId: 'exec-1',
      nodeOutputCache: { 'completed-node': { value: 'done' } },
      organizationId: 'org-1',
      remainingNodeIds: ['next-node', 'pause-node'],
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

    // The version tuple is globally unique, so the pinned lookup is keyed on
    // it alone and tenant ownership is asserted against the loaded row.
    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith({
      select: expect.objectContaining({
        graph: true,
        id: true,
        organizationId: true,
        userId: true,
      }),
      where: {
        id: WORKFLOW_VERSION_ID,
        workflowId: 'workflow-1',
      },
    });
    expect(executionsService.getRuntimeState).toHaveBeenCalledWith('exec-1');
    expect(executionsService.findOne).toHaveBeenCalledWith({
      id: 'exec-1',
      organizationId: 'org-1',
    });
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

  it('terminalizes a delayed execution when its pinned workflow was retired', async () => {
    const startedAt = new Date('2026-08-28T10:00:00.000Z');
    executionsService.findOne.mockResolvedValue({
      id: 'exec-1',
      startedAt,
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowVersionId: WORKFLOW_VERSION_ID,
    });
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersion({
        id: 'workflow-1',
        isDeleted: true,
        label: 'Retired workflow',
      }),
    );
    executionsService.completeExecution.mockResolvedValue({
      id: 'exec-1',
      metadata: {},
    });

    const result = await service.resumeAfterDelay({
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
    });

    expect(result).toMatchObject({
      error:
        'Workflow workflow-1 is retired and cannot resume pinned version workflow-version-1',
      executionId: 'exec-1',
      startedAt,
      status: WorkflowExecutionStatus.FAILED,
    });
    expect(executionsService.completeExecution).toHaveBeenCalledWith(
      'exec-1',
      'Workflow workflow-1 is retired and cannot resume pinned version workflow-version-1',
    );
    expect(engineAdapter.executeNode).not.toHaveBeenCalled();
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
    expect(engineAdapter.executeNode).not.toHaveBeenCalled();
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
    executionsService.findOne.mockResolvedValue({
      id: 'exec-1',
      workflowId: 'workflow-1',
      workflowVersionId: WORKFLOW_VERSION_ID,
    });
    prisma.workflowVersion.findFirst.mockResolvedValue(
      pinnedVersion({
        brandId: 'brand-1',
        id: 'workflow-1',
        label: 'Agent workflow',
      }),
    );
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

    expect(engineAdapter.executeNode).not.toHaveBeenCalled();
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
      expect(prisma.workflowVersion.findFirst).not.toHaveBeenCalled();
    });

    it('terminalizes an existing execution when its pinned workflow was retired', async () => {
      const startedAt = new Date('2026-08-28T10:00:00.000Z');
      executionsService.findOne.mockResolvedValue({
        id: 'exec-1',
        startedAt,
        status: WorkflowExecutionStatus.RUNNING,
        workflowId: 'workflow-1',
        workflowVersionId: WORKFLOW_VERSION_ID,
      });
      prisma.workflowVersion.findFirst.mockResolvedValue(
        pinnedVersion({
          id: 'workflow-1',
          isDeleted: true,
          label: 'Retired workflow',
        }),
      );
      executionsService.completeExecution.mockResolvedValue({
        id: 'exec-1',
        metadata: {},
      });

      const result = await service.continueExistingExecution(
        'exec-1',
        triggerEvent,
      );

      expect(result).toMatchObject({
        error:
          'Workflow workflow-1 is retired and cannot resume pinned version workflow-version-1',
        executionId: 'exec-1',
        startedAt,
        status: WorkflowExecutionStatus.FAILED,
      });
      expect(executionsService.completeExecution).toHaveBeenCalledWith(
        'exec-1',
        'Workflow workflow-1 is retired and cannot resume pinned version workflow-version-1',
      );
      expect(engineAdapter.executeNode).not.toHaveBeenCalled();
    });

    it('no-ops when the prior execution already completed', async () => {
      executionsService.findOne.mockResolvedValue({
        completedAt: new Date('2026-08-12T10:00:00.000Z'),
        id: 'exec-1',
        nodeResults: [],
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
      expect(prisma.workflowVersion.findFirst).not.toHaveBeenCalled();
      expect(executionsService.createExecution).not.toHaveBeenCalled();
    });

    it('no-ops when the prior execution was cancelled', async () => {
      executionsService.findOne.mockResolvedValue({
        completedAt: new Date('2026-08-12T10:05:00.000Z'),
        id: 'exec-1',
        nodeResults: [],
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
      expect(prisma.workflowVersion.findFirst).not.toHaveBeenCalled();
      expect(executionsService.startExecution).not.toHaveBeenCalled();
      expect(executionsService.createExecution).not.toHaveBeenCalled();
    });

    it('re-enters a PENDING prior execution under the same id', async () => {
      const executableWorkflow: ExecutableWorkflow = {
        edges: [],
        id: 'workflow-1',
        lockedNodeIds: [],
        nodes: [
          createExecutableActionNode({
            actionId: 'llm',
            id: 'action-node',
            label: 'Action',
          }),
        ],
        organizationId: 'org-1',
        userId: 'user-1',
        versionId: WORKFLOW_VERSION_ID,
      };

      executionsService.findOne.mockResolvedValue({
        id: 'exec-pending',
        status: WorkflowExecutionStatus.PENDING,
        workflowId: 'workflow-1',
        workflowVersionId: WORKFLOW_VERSION_ID,
      });
      prisma.workflowVersion.findFirst.mockResolvedValue(
        pinnedVersion({
          id: 'workflow-1',
          label: 'Pending resume',
        }),
      );
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
      engineAdapter.executeNode.mockResolvedValue({
        completedAt: new Date(),
        creditsUsed: 0,
        nodeId: 'pending-node',
        output: {},
        retryCount: 0,
        startedAt: new Date(),
        status: 'completed',
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
      expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: WORKFLOW_VERSION_ID,
            workflowId: 'workflow-1',
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
          createExecutableActionNode({
            actionId: 'publish',
            id: 'publish-node',
            label: 'Publish',
          }),
        ],
        organizationId: 'org-1',
        userId: 'user-1',
        versionId: WORKFLOW_VERSION_ID,
      };

      executionsService.findOne.mockResolvedValue({
        id: 'exec-1',
        status: WorkflowExecutionStatus.FAILED,
        workflowId: 'workflow-1',
        workflowVersionId: WORKFLOW_VERSION_ID,
      });
      prisma.workflowVersion.findFirst.mockResolvedValue(
        pinnedVersion({
          id: 'workflow-1',
          label: 'Retry workflow',
        }),
      );
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
      engineAdapter.executeNode.mockResolvedValue({
        completedAt: new Date(),
        creditsUsed: 0,
        nodeId: 'publish-node',
        output: { ok: true },
        retryCount: 0,
        startedAt: new Date(),
        status: 'completed',
      } satisfies NodeExecutionResult);
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
