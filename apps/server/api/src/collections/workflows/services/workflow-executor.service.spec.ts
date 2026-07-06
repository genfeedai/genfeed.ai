import {
  EXECUTABLE_WORKFLOW_SELECT,
  WorkflowExecutorService,
} from '@api/collections/workflows/services/workflow-executor.service';
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
    applyRuntimeInputValues: vi.fn(),
    convertToExecutableWorkflow: vi.fn(),
    executeWorkflow: vi.fn(),
  };
  const executionsService = {
    completeExecution: vi.fn(),
    findOne: vi.fn(),
    getRuntimeState: vi.fn(),
    setCreditsUsed: vi.fn(),
    setFailedNodeId: vi.fn(),
    updateExecutionMetadata: vi.fn(),
    updateNodeResult: vi.fn(),
  };
  const websocketService = {
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
});
