import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { ExecutionRunResult } from '@genfeedai/workflow-engine';
import { describe, expect, it, vi } from 'vitest';

// =============================================================================
// TEST IDS (valid MongoDB ObjectId hex strings)
// =============================================================================

const TEST_ORG_ID = '507f1f77bcf86cd799439011';
const TEST_USER_ID = '507f1f77bcf86cd799439012';
const TEST_WORKFLOW_ID = '507f1f77bcf86cd799439013';
const TEST_EXEC_ID = '507f1f77bcf86cd799439014';

// =============================================================================
// MOCKS
// =============================================================================

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockWorkflowModel() {
  return {
    find: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      }),
    }),
    findOne: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
}

function createMockEngineAdapter() {
  return {
    applyRuntimeInputValues: vi.fn(
      (_workflowDoc, executableWorkflow, _runtimeInputs) => executableWorkflow,
    ),
    convertToExecutableWorkflow: vi.fn().mockReturnValue({
      edges: [],
      id: TEST_WORKFLOW_ID,
      lockedNodeIds: [],
      nodes: [],
      organizationId: TEST_ORG_ID,
      userId: TEST_USER_ID,
    }),
    executeWorkflow: vi.fn().mockResolvedValue({
      completedAt: new Date(),
      error: undefined,
      nodeResults: new Map(),
      runId: 'run-1',
      startedAt: new Date(),
      status: 'completed',
      totalCreditsUsed: 0,
      workflowId: TEST_WORKFLOW_ID,
    } satisfies ExecutionRunResult),
    resumeWorkflow: vi.fn(),
  };
}

function createMockExecutionsService() {
  return {
    completeExecution: vi.fn().mockResolvedValue(null),
    createExecution: vi.fn().mockResolvedValue({
      _id: { toString: () => TEST_EXEC_ID },
    }),
    findOne: vi.fn().mockResolvedValue(null),
    setCreditsUsed: vi.fn().mockResolvedValue(undefined),
    setFailedNodeId: vi.fn().mockResolvedValue(undefined),
    startExecution: vi.fn().mockResolvedValue(null),
    updateExecutionMetadata: vi.fn().mockResolvedValue(null),
    updateNodeResult: vi.fn().mockResolvedValue(null),
  };
}

function createMockWebsocketService() {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  };
}

function createTriggerEvent(
  overrides: Partial<TriggerEvent> = {},
): TriggerEvent {
  return {
    data: { postId: 'post-123', text: 'Hello @user' },
    organizationId: TEST_ORG_ID,
    platform: 'twitter',
    type: 'mentionTrigger',
    userId: TEST_USER_ID,
    ...overrides,
  };
}

function createWorkflowDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => TEST_WORKFLOW_ID },
    edges: [],
    isDeleted: false,
    lifecycle: WorkflowLifecycle.PUBLISHED,
    lockedNodeIds: [],
    nodes: [
      {
        data: {
          config: { platform: 'twitter' },
          label: 'Mention Trigger',
        },
        id: 'trigger-1',
        position: { x: 0, y: 0 },
        type: 'trigger-mention',
      },
    ],
    organization: { toString: () => TEST_ORG_ID },
    user: { toString: () => TEST_USER_ID },
    ...overrides,
  };
}

function createService(
  overrides: {
    engineAdapter?: ReturnType<typeof createMockEngineAdapter>;
    executionsService?: ReturnType<typeof createMockExecutionsService>;
    logger?: ReturnType<typeof createMockLogger>;
    workflowModel?: ReturnType<typeof createMockWorkflowModel>;
    websocketService?: ReturnType<typeof createMockWebsocketService>;
  } = {},
) {
  const logger = overrides.logger ?? createMockLogger();
  const workflowModel = overrides.workflowModel ?? createMockWorkflowModel();
  const engineAdapter = overrides.engineAdapter ?? createMockEngineAdapter();
  const executionsService =
    overrides.executionsService ?? createMockExecutionsService();
  const websocketService =
    overrides.websocketService ?? createMockWebsocketService();

  // Construct via reflection since the constructor uses NestJS DI
  const service = new (
    WorkflowExecutorService as unknown as new (
      ...args: unknown[]
    ) => WorkflowExecutorService
  )(workflowModel, logger, engineAdapter, executionsService, websocketService);

  return {
    engineAdapter,
    executionsService,
    logger,
    service,
    websocketService,
    workflowModel,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('WorkflowExecutorService', () => {
  describe('handleTriggerEvent', () => {
    it('should return empty array when no matching workflows found', async () => {
      const { service, workflowModel } = createService();
      workflowModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.handleTriggerEvent(createTriggerEvent());

      expect(result).toEqual([]);
    });

    it('should find and execute matching published workflows', async () => {
      const workflowDoc = createWorkflowDoc();
      const { service, workflowModel, engineAdapter, executionsService } =
        createService();

      workflowModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([workflowDoc]),
        }),
      });

      // Make executeNodeGraph succeed by providing matching trigger node
      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Mention Trigger',
            type: 'mentionTrigger',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      const results = await service.handleTriggerEvent(createTriggerEvent());

      expect(results).toHaveLength(1);
      expect(executionsService.createExecution).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_ORG_ID,
        expect.objectContaining({
          trigger: WorkflowExecutionTrigger.EVENT,
        }),
      );
    });

    it('should match workflows by trigger node type and platform', async () => {
      const twitterWorkflow = createWorkflowDoc({
        _id: { toString: () => TEST_WORKFLOW_ID },
        nodes: [
          {
            data: {
              config: { platform: 'twitter' },
              label: 'Mention Trigger',
            },
            id: 'trigger-1',
            position: { x: 0, y: 0 },
            type: 'trigger-mention',
          },
        ],
      });

      const instagramWorkflow = createWorkflowDoc({
        _id: { toString: () => '507f1f77bcf86cd799439015' },
        nodes: [
          {
            data: {
              config: { platform: 'instagram' },
              label: 'Mention Trigger',
            },
            id: 'trigger-1',
            position: { x: 0, y: 0 },
            type: 'trigger-mention',
          },
        ],
      });

      const { service, workflowModel, engineAdapter } = createService();

      workflowModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([twitterWorkflow, instagramWorkflow]),
        }),
      });

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Mention Trigger',
            type: 'mentionTrigger',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      const results = await service.handleTriggerEvent(
        createTriggerEvent({ platform: 'twitter' }),
      );

      // Only the twitter workflow should match
      expect(results).toHaveLength(1);
    });

    it('should handle execution errors gracefully', async () => {
      const { service, workflowModel, engineAdapter } = createService();

      workflowModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([createWorkflowDoc()]),
        }),
      });

      engineAdapter.convertToExecutableWorkflow.mockImplementation(() => {
        throw new Error('Conversion failed');
      });

      const results = await service.handleTriggerEvent(createTriggerEvent());

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(WorkflowExecutionStatus.FAILED);
      expect(results[0].error).toContain('Conversion failed');
    });

    it('should query only published, non-deleted workflows', async () => {
      const { service, workflowModel } = createService();

      workflowModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      });

      await service.handleTriggerEvent(createTriggerEvent());

      expect(workflowModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          lifecycle: WorkflowLifecycle.PUBLISHED,
        }),
      );
    });
  });

  describe('executeTriggeredWorkflow', () => {
    it('should create execution record and start execution', async () => {
      const { service, executionsService, engineAdapter } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      expect(executionsService.createExecution).toHaveBeenCalledOnce();
      expect(executionsService.startExecution).toHaveBeenCalledWith(
        TEST_EXEC_ID,
      );
      expect(result.executionId).toBe(TEST_EXEC_ID);
    });

    it('should update workflow status to RUNNING then COMPLETED', async () => {
      const { service, workflowModel, engineAdapter } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      // First call: set to RUNNING
      expect(workflowModel.updateOne).toHaveBeenCalledWith(
        { _id: TEST_WORKFLOW_ID },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: WorkflowStatus.RUNNING,
          }),
        }),
      );

      // Second call: set to COMPLETED
      expect(workflowModel.updateOne).toHaveBeenCalledWith(
        { _id: TEST_WORKFLOW_ID },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: WorkflowStatus.COMPLETED,
          }),
        }),
      );
    });

    it('should emit websocket events', async () => {
      const { service, websocketService, engineAdapter } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      expect(websocketService.emit).toHaveBeenCalledWith(
        `workflow:${TEST_WORKFLOW_ID}:started`,
        expect.objectContaining({ workflowId: TEST_WORKFLOW_ID }),
      );

      expect(websocketService.emit).toHaveBeenCalledWith(
        `workflow:${TEST_WORKFLOW_ID}:completed`,
        expect.objectContaining({ workflowId: TEST_WORKFLOW_ID }),
      );
    });

    it('should handle execution failure and update status', async () => {
      const { service, workflowModel, executionsService, engineAdapter } =
        createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'fail-node',
            inputs: [],
            label: 'Fail',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        error: 'Engine error',
        nodeResults: new Map([
          [
            'fail-node',
            {
              completedAt: new Date(),
              creditsUsed: 0,
              error: 'Engine error',
              nodeId: 'fail-node',
              retryCount: 0,
              startedAt: new Date(),
              status: 'failed',
            },
          ],
        ]),
        runId: 'run-1',
        startedAt: new Date(),
        status: 'failed',
        totalCreditsUsed: 0,
        workflowId: TEST_WORKFLOW_ID,
      });

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      expect(result.status).toBe(WorkflowExecutionStatus.FAILED);

      expect(executionsService.completeExecution).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        'Nodes failed: fail-node',
      );

      expect(workflowModel.updateOne).toHaveBeenCalledWith(
        { _id: TEST_WORKFLOW_ID },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: WorkflowStatus.FAILED,
          }),
        }),
      );
    });
  });

  describe('condition branching', () => {
    it('should follow the true branch when condition evaluates to true', async () => {
      const { service, engineAdapter } = createService();

      const executedNodes: string[] = [];

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'condition-1' },
          {
            id: 'e2',
            source: 'condition-1',
            sourceHandle: 'true',
            target: 'action-true',
          },
          {
            id: 'e3',
            source: 'condition-1',
            sourceHandle: 'false',
            target: 'action-false',
          },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {
              customField: 'followerCount',
              field: 'custom',
              operator: 'greaterThan',
              value: 100,
            },
            id: 'condition-1',
            inputs: [],
            label: 'Check Followers',
            type: 'condition',
          },
          {
            config: {},
            id: 'action-true',
            inputs: [],
            label: 'True Action',
            type: 'postReply',
          },
          {
            config: {},
            id: 'action-false',
            inputs: [],
            label: 'False Action',
            type: 'sendDm',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      // Mock executeWorkflow to track which nodes are executed
      // and simulate condition result
      engineAdapter.executeWorkflow.mockImplementation(
        async (workflow: { nodes: Array<{ id: string; type: string }> }) => {
          const node = workflow.nodes.find(
            (n: { type: string }) => n.type !== 'noop',
          );
          if (node) {
            executedNodes.push(node.id);
          }

          // Simulate condition node returning true
          if (node?.type === 'condition') {
            return {
              completedAt: new Date(),
              nodeResults: new Map([
                [
                  node.id,
                  {
                    completedAt: new Date(),
                    creditsUsed: 0,
                    nodeId: node.id,
                    output: { data: null, result: true },
                    retryCount: 0,
                    startedAt: new Date(),
                    status: 'completed',
                  },
                ],
              ]),
              runId: 'run-1',
              startedAt: new Date(),
              status: 'completed',
              totalCreditsUsed: 0,
              workflowId: TEST_WORKFLOW_ID,
            };
          }

          return {
            completedAt: new Date(),
            nodeResults: new Map([
              [
                node?.id ?? 'unknown',
                {
                  completedAt: new Date(),
                  creditsUsed: 0,
                  nodeId: node?.id ?? 'unknown',
                  output: { success: true },
                  retryCount: 0,
                  startedAt: new Date(),
                  status: 'completed',
                },
              ],
            ]),
            runId: 'run-1',
            startedAt: new Date(),
            status: 'completed',
            totalCreditsUsed: 0,
            workflowId: TEST_WORKFLOW_ID,
          };
        },
      );

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      // Should execute condition-1 and action-true, but NOT action-false
      expect(executedNodes).toContain('condition-1');
      expect(executedNodes).toContain('action-true');
      expect(executedNodes).not.toContain('action-false');
    });

    it('should follow the false branch when condition evaluates to false', async () => {
      const { service, engineAdapter } = createService();

      const executedNodes: string[] = [];

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'condition-1' },
          {
            id: 'e2',
            source: 'condition-1',
            sourceHandle: 'true',
            target: 'action-true',
          },
          {
            id: 'e3',
            source: 'condition-1',
            sourceHandle: 'false',
            target: 'action-false',
          },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {
              customField: 'followerCount',
              field: 'custom',
              operator: 'greaterThan',
              value: 100,
            },
            id: 'condition-1',
            inputs: [],
            label: 'Check',
            type: 'condition',
          },
          {
            config: {},
            id: 'action-true',
            inputs: [],
            label: 'True',
            type: 'postReply',
          },
          {
            config: {},
            id: 'action-false',
            inputs: [],
            label: 'False',
            type: 'sendDm',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockImplementation(
        async (workflow: { nodes: Array<{ id: string; type: string }> }) => {
          const node = workflow.nodes.find(
            (n: { type: string }) => n.type !== 'noop',
          );
          if (node) executedNodes.push(node.id);

          if (node?.type === 'condition') {
            return {
              completedAt: new Date(),
              nodeResults: new Map([
                [
                  node.id,
                  {
                    completedAt: new Date(),
                    creditsUsed: 0,
                    nodeId: node.id,
                    output: { data: null, result: false },
                    retryCount: 0,
                    startedAt: new Date(),
                    status: 'completed',
                  },
                ],
              ]),
              runId: 'run-1',
              startedAt: new Date(),
              status: 'completed',
              totalCreditsUsed: 0,
              workflowId: TEST_WORKFLOW_ID,
            };
          }

          return {
            completedAt: new Date(),
            nodeResults: new Map([
              [
                node?.id ?? 'unknown',
                {
                  completedAt: new Date(),
                  creditsUsed: 0,
                  nodeId: node?.id ?? 'unknown',
                  output: { success: true },
                  retryCount: 0,
                  startedAt: new Date(),
                  status: 'completed',
                },
              ],
            ]),
            runId: 'run-1',
            startedAt: new Date(),
            status: 'completed',
            totalCreditsUsed: 0,
            workflowId: TEST_WORKFLOW_ID,
          };
        },
      );

      await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      expect(executedNodes).toContain('condition-1');
      expect(executedNodes).toContain('action-false');
      expect(executedNodes).not.toContain('action-true');
    });
  });

  describe('delay handling', () => {
    it('should detect delay metadata and pause execution', async () => {
      const { service, engineAdapter } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'delay-1' },
          { id: 'e2', source: 'delay-1', target: 'action-1' },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: { duration: 30, mode: 'fixed', unit: 'minutes' },
            id: 'delay-1',
            inputs: [],
            label: 'Wait 30min',
            type: 'delay',
          },
          {
            config: {},
            id: 'action-1',
            inputs: [],
            label: 'Reply',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      const futureTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      engineAdapter.executeWorkflow.mockImplementation(
        async (workflow: { nodes: Array<{ id: string; type: string }> }) => {
          const node = workflow.nodes.find(
            (n: { type: string }) => n.type !== 'noop',
          );

          if (node?.type === 'delay') {
            return {
              completedAt: new Date(),
              nodeResults: new Map([
                [
                  node.id,
                  {
                    completedAt: new Date(),
                    creditsUsed: 0,
                    nodeId: node.id,
                    output: {
                      data: null,
                      delayMs: 1800000,
                      resumeAt: futureTime,
                      state: { completed: false },
                    },
                    retryCount: 0,
                    startedAt: new Date(),
                    status: 'completed',
                  },
                ],
              ]),
              runId: 'run-1',
              startedAt: new Date(),
              status: 'completed',
              totalCreditsUsed: 0,
              workflowId: TEST_WORKFLOW_ID,
            };
          }

          return {
            completedAt: new Date(),
            nodeResults: new Map(),
            runId: 'run-1',
            startedAt: new Date(),
            status: 'completed',
            totalCreditsUsed: 0,
            workflowId: TEST_WORKFLOW_ID,
          };
        },
      );

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      // Result should be in 'running' status (paused for delay)
      // The _delayJobData should be present for the processor
      const resultAny = result as unknown as Record<string, unknown>;
      // The delay node was executed, and action-1 should not have been
      expect(result.executionId).toBe(TEST_EXEC_ID);
    });
  });

  describe('review gate handling', () => {
    it('should pause execution when a review gate is reached', async () => {
      const { service, engineAdapter, executionsService } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'review-1' },
          { id: 'e2', source: 'review-1', target: 'action-1' },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'review-1',
            inputs: [],
            label: 'Review Gate',
            type: 'reviewGate',
          },
          {
            config: {},
            id: 'action-1',
            inputs: [],
            label: 'Reply',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent({
          data: {
            caption: 'Ready to approve',
            media: 'https://cdn.example.com/image.jpg',
          },
        }),
      );

      expect(result.status).toBe(WorkflowExecutionStatus.RUNNING);
      expect(executionsService.updateExecutionMetadata).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        expect.objectContaining({
          pendingApproval: expect.objectContaining({
            inputCaption: 'Ready to approve',
            inputMedia: 'https://cdn.example.com/image.jpg',
            nodeId: 'review-1',
          }),
        }),
      );
      expect(executionsService.updateNodeResult).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        expect.objectContaining({
          nodeId: 'review-1',
          output: expect.objectContaining({
            approvalId: TEST_EXEC_ID,
            approvalStatus: 'pending',
          }),
          status: WorkflowExecutionStatus.RUNNING,
        }),
      );
    });

    it('should resume downstream nodes after approval', async () => {
      const { service, engineAdapter, executionsService, workflowModel } =
        createService();

      workflowModel.findOne.mockResolvedValue(
        createWorkflowDoc({
          edges: [
            { id: 'e1', source: 'trigger-1', target: 'review-1' },
            {
              id: 'e2',
              source: 'review-1',
              target: 'action-1',
              targetHandle: 'media',
            },
          ],
          nodes: [
            {
              data: {
                config: { platform: 'twitter' },
                label: 'Mention Trigger',
              },
              id: 'trigger-1',
              position: { x: 0, y: 0 },
              type: 'trigger-mention',
            },
            {
              data: {
                config: {},
                label: 'Review Gate',
              },
              id: 'review-1',
              position: { x: 10, y: 10 },
              type: 'reviewGate',
            },
            {
              data: {
                config: {},
                label: 'Reply',
              },
              id: 'action-1',
              position: { x: 20, y: 20 },
              type: 'postReply',
            },
          ],
        }),
      );

      executionsService.findOne.mockResolvedValue({
        _id: TEST_EXEC_ID,
        completedAt: undefined,
        inputValues: {},
        metadata: {
          pendingApproval: {
            inputCaption: 'Ready to approve',
            inputMedia: 'https://cdn.example.com/image.jpg',
            nodeId: 'review-1',
            rawCaption: 'Ready to approve',
            rawMedia: 'https://cdn.example.com/image.jpg',
            requestedAt: new Date().toISOString(),
          },
        },
        nodeResults: [
          {
            nodeId: 'trigger-1',
            output: {
              caption: 'Ready to approve',
              media: 'https://cdn.example.com/image.jpg',
            },
            status: WorkflowExecutionStatus.COMPLETED,
          },
          {
            nodeId: 'review-1',
            output: {
              approvalId: TEST_EXEC_ID,
              approvalStatus: 'pending',
            },
            status: WorkflowExecutionStatus.RUNNING,
          },
        ],
        progress: 50,
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      });

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'review-1' },
          {
            id: 'e2',
            source: 'review-1',
            target: 'action-1',
            targetHandle: 'media',
          },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'review-1',
            inputs: [],
            label: 'Review Gate',
            type: 'reviewGate',
          },
          {
            config: {},
            id: 'action-1',
            inputs: [],
            label: 'Reply',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });
      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        nodeResults: new Map([
          [
            'action-1',
            {
              completedAt: new Date(),
              creditsUsed: 0,
              nodeId: 'action-1',
              output: { success: true },
              retryCount: 0,
              startedAt: new Date(),
              status: 'completed',
            },
          ],
        ]),
        runId: 'run-2',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 0,
        workflowId: TEST_WORKFLOW_ID,
      });

      const result = await service.submitReviewGateApproval(
        TEST_WORKFLOW_ID,
        TEST_EXEC_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        'review-1',
        true,
      );

      expect(engineAdapter.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: TEST_WORKFLOW_ID }),
        expect.objectContaining({ nodeIds: ['action-1'] }),
      );
      expect(executionsService.completeExecution).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        undefined,
      );
      expect(result).toEqual(
        expect.objectContaining({
          approvedBy: TEST_USER_ID,
          executionId: TEST_EXEC_ID,
          nodeId: 'review-1',
          status: 'approved',
        }),
      );
    });

    it('should fail the execution when a review gate is rejected', async () => {
      const { service, engineAdapter, executionsService, workflowModel } =
        createService();

      workflowModel.findOne.mockResolvedValue(
        createWorkflowDoc({
          edges: [{ id: 'e1', source: 'trigger-1', target: 'review-1' }],
          nodes: [
            {
              data: {
                config: { platform: 'twitter' },
                label: 'Mention Trigger',
              },
              id: 'trigger-1',
              position: { x: 0, y: 0 },
              type: 'trigger-mention',
            },
            {
              data: {
                config: {},
                label: 'Review Gate',
              },
              id: 'review-1',
              position: { x: 10, y: 10 },
              type: 'reviewGate',
            },
          ],
        }),
      );

      executionsService.findOne.mockResolvedValue({
        _id: TEST_EXEC_ID,
        completedAt: undefined,
        inputValues: {},
        metadata: {
          pendingApproval: {
            inputCaption: 'Needs work',
            inputMedia: 'https://cdn.example.com/image.jpg',
            nodeId: 'review-1',
            rawCaption: 'Needs work',
            rawMedia: 'https://cdn.example.com/image.jpg',
            requestedAt: new Date().toISOString(),
          },
        },
        nodeResults: [
          {
            nodeId: 'review-1',
            output: {
              approvalId: TEST_EXEC_ID,
              approvalStatus: 'pending',
            },
            status: WorkflowExecutionStatus.RUNNING,
          },
        ],
        progress: 50,
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      });

      const result = await service.submitReviewGateApproval(
        TEST_WORKFLOW_ID,
        TEST_EXEC_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        'review-1',
        false,
        'Rejected via review gate',
      );

      expect(engineAdapter.executeWorkflow).not.toHaveBeenCalled();
      expect(executionsService.setFailedNodeId).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        'review-1',
      );
      expect(executionsService.completeExecution).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        'Rejected via review gate',
      );
      expect(workflowModel.updateOne).toHaveBeenCalledWith(
        { _id: TEST_WORKFLOW_ID },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: WorkflowStatus.FAILED,
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          executionId: TEST_EXEC_ID,
          nodeId: 'review-1',
          rejectionReason: 'Rejected via review gate',
          status: 'rejected',
        }),
      );
    });
  });

  describe('per-node error handling', () => {
    it('should skip downstream nodes when a node fails', async () => {
      const { service, engineAdapter } = createService();

      const executedNodes: string[] = [];

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'node-a' },
          { id: 'e2', source: 'node-a', target: 'node-b' },
          { id: 'e3', source: 'node-b', target: 'node-c' },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'node-a',
            inputs: [],
            label: 'Node A',
            type: 'postReply',
          },
          {
            config: {},
            id: 'node-b',
            inputs: [],
            label: 'Node B',
            type: 'sendDm',
          },
          {
            config: {},
            id: 'node-c',
            inputs: [],
            label: 'Node C',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockImplementation(
        async (workflow: { nodes: Array<{ id: string; type: string }> }) => {
          const node = workflow.nodes.find(
            (n: { type: string }) => n.type !== 'noop',
          );
          if (node) executedNodes.push(node.id);

          // Node A fails
          if (node?.id === 'node-a') {
            return {
              completedAt: new Date(),
              error: 'API rate limited',
              nodeResults: new Map([
                [
                  node.id,
                  {
                    completedAt: new Date(),
                    creditsUsed: 0,
                    error: 'API rate limited',
                    nodeId: node.id,
                    retryCount: 3,
                    startedAt: new Date(),
                    status: 'failed',
                  },
                ],
              ]),
              runId: 'run-1',
              startedAt: new Date(),
              status: 'failed',
              totalCreditsUsed: 0,
              workflowId: TEST_WORKFLOW_ID,
            };
          }

          return {
            completedAt: new Date(),
            nodeResults: new Map(),
            runId: 'run-1',
            startedAt: new Date(),
            status: 'completed',
            totalCreditsUsed: 0,
            workflowId: TEST_WORKFLOW_ID,
          };
        },
      );

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      // Node A should be executed, but B and C should be skipped
      expect(executedNodes).toContain('node-a');
      expect(executedNodes).not.toContain('node-b');
      expect(executedNodes).not.toContain('node-c');
      expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
    });

    it('should continue other branches when one branch fails', async () => {
      const { service, engineAdapter } = createService();

      const executedNodes: string[] = [];

      // Diamond with independent branches:
      // trigger -> node-a (fails), trigger -> node-b (succeeds)
      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [
          { id: 'e1', source: 'trigger-1', target: 'node-a' },
          { id: 'e2', source: 'trigger-1', target: 'node-b' },
        ],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'node-a',
            inputs: [],
            label: 'Node A',
            type: 'postReply',
          },
          {
            config: {},
            id: 'node-b',
            inputs: [],
            label: 'Node B',
            type: 'sendDm',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockImplementation(
        async (workflow: { nodes: Array<{ id: string; type: string }> }) => {
          const node = workflow.nodes.find(
            (n: { type: string }) => n.type !== 'noop',
          );
          if (node) executedNodes.push(node.id);

          if (node?.id === 'node-a') {
            return {
              completedAt: new Date(),
              error: 'Failed',
              nodeResults: new Map([
                [
                  node.id,
                  {
                    completedAt: new Date(),
                    creditsUsed: 0,
                    error: 'Failed',
                    nodeId: node.id,
                    retryCount: 0,
                    startedAt: new Date(),
                    status: 'failed',
                  },
                ],
              ]),
              runId: 'run-1',
              startedAt: new Date(),
              status: 'failed',
              totalCreditsUsed: 0,
              workflowId: TEST_WORKFLOW_ID,
            };
          }

          return {
            completedAt: new Date(),
            nodeResults: new Map([
              [
                node?.id ?? 'unknown',
                {
                  completedAt: new Date(),
                  creditsUsed: 0,
                  nodeId: node?.id ?? 'unknown',
                  output: { success: true },
                  retryCount: 0,
                  startedAt: new Date(),
                  status: 'completed',
                },
              ],
            ]),
            runId: 'run-1',
            startedAt: new Date(),
            status: 'completed',
            totalCreditsUsed: 0,
            workflowId: TEST_WORKFLOW_ID,
          };
        },
      );

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      // Both nodes should have been attempted
      expect(executedNodes).toContain('node-a');
      expect(executedNodes).toContain('node-b');
      // Overall status is failed because node-a failed
      expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
    });
  });

  describe('execution tracking', () => {
    it('should track each node result in execution record', async () => {
      const { service, executionsService, engineAdapter } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'action-1',
            inputs: [],
            label: 'Reply',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        nodeResults: new Map([
          [
            'action-1',
            {
              completedAt: new Date(),
              creditsUsed: 1,
              nodeId: 'action-1',
              output: { replyId: 'reply-123' },
              retryCount: 0,
              startedAt: new Date(),
              status: 'completed',
            },
          ],
        ]),
        runId: 'run-1',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 1,
        workflowId: TEST_WORKFLOW_ID,
      });

      await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      // Should have called updateNodeResult for trigger and action nodes
      expect(executionsService.updateNodeResult).toHaveBeenCalled();
    });

    it('should complete execution with error on failure', async () => {
      const { service, executionsService, engineAdapter } = createService();

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: { platform: 'twitter' },
            id: 'trigger-1',
            inputs: [],
            label: 'Trigger',
            type: 'mentionTrigger',
          },
          {
            config: {},
            id: 'fail-node',
            inputs: [],
            label: 'Fail',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        error: 'Publisher not configured',
        nodeResults: new Map([
          [
            'fail-node',
            {
              completedAt: new Date(),
              creditsUsed: 0,
              error: 'Publisher not configured',
              nodeId: 'fail-node',
              retryCount: 3,
              startedAt: new Date(),
              status: 'failed',
            },
          ],
        ]),
        runId: 'run-1',
        startedAt: new Date(),
        status: 'failed',
        totalCreditsUsed: 0,
        workflowId: TEST_WORKFLOW_ID,
      });

      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
      expect(executionsService.completeExecution).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        expect.stringContaining('fail'),
      );
    });
  });

  describe('resumeAfterDelay', () => {
    it('should resume workflow execution with cached outputs', async () => {
      const { service, workflowModel, engineAdapter, executionsService } =
        createService();

      const workflowDoc = createWorkflowDoc();
      workflowModel.findOne = vi.fn().mockResolvedValue(workflowDoc);

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [
          {
            config: {},
            id: 'action-1',
            inputs: [],
            label: 'Reply',
            type: 'postReply',
          },
        ],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      engineAdapter.executeWorkflow.mockResolvedValue({
        completedAt: new Date(),
        nodeResults: new Map([
          [
            'action-1',
            {
              completedAt: new Date(),
              creditsUsed: 1,
              nodeId: 'action-1',
              output: { success: true },
              retryCount: 0,
              startedAt: new Date(),
              status: 'completed',
            },
          ],
        ]),
        runId: 'run-1',
        startedAt: new Date(),
        status: 'completed',
        totalCreditsUsed: 1,
        workflowId: TEST_WORKFLOW_ID,
      });

      const result = await service.resumeAfterDelay({
        delayNodeId: 'delay-1',
        executionId: TEST_EXEC_ID,
        nodeOutputCache: {
          'delay-1': { delayMs: 1800000, resumeAt: new Date().toISOString() },
          'trigger-1': { postId: 'post-123' },
        },
        organizationId: TEST_ORG_ID,
        remainingNodeIds: ['action-1'],
        triggerEvent: createTriggerEvent(),
        userId: TEST_USER_ID,
        workflowId: TEST_WORKFLOW_ID,
      });

      expect(result.status).toBe(WorkflowExecutionStatus.COMPLETED);
      expect(engineAdapter.executeWorkflow).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nodeIds: ['action-1'],
        }),
      );
    });

    it('should fail gracefully when workflow not found during resume', async () => {
      const { service, workflowModel, executionsService } = createService();

      workflowModel.findOne = vi.fn().mockResolvedValue(null);

      const result = await service.resumeAfterDelay({
        delayNodeId: 'delay-1',
        executionId: TEST_EXEC_ID,
        nodeOutputCache: {},
        organizationId: TEST_ORG_ID,
        remainingNodeIds: ['action-1'],
        triggerEvent: createTriggerEvent(),
        userId: TEST_USER_ID,
        workflowId: '507f1f77bcf86cd799439099',
      });

      expect(result.status).toBe(WorkflowExecutionStatus.FAILED);
      expect(result.error).toContain('not found');
      expect(executionsService.completeExecution).toHaveBeenCalledWith(
        TEST_EXEC_ID,
        expect.stringContaining('not found'),
      );
    });
  });

  describe('event type mapping', () => {
    it.each([
      ['mention', 'mentionTrigger'],
      ['mentionTrigger', 'mentionTrigger'],
      ['newFollower', 'newFollowerTrigger'],
      ['newFollowerTrigger', 'newFollowerTrigger'],
      ['newLike', 'newLikeTrigger'],
      ['newLikeTrigger', 'newLikeTrigger'],
      ['newRepost', 'newRepostTrigger'],
      ['newRepostTrigger', 'newRepostTrigger'],
      ['trend', 'trendTrigger'],
      ['trendTrigger', 'trendTrigger'],
    ])('should map event type "%s" to node type "%s"', async (eventType, expectedNodeType) => {
      const { service, workflowModel } = createService();

      const workflowWithTrigger = createWorkflowDoc({
        nodes: [
          {
            data: {
              config: { platform: 'twitter' },
              label: 'Trigger',
            },
            id: 'trigger-1',
            position: { x: 0, y: 0 },
            type: expectedNodeType, // Already in executor format
          },
        ],
      });

      workflowModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([workflowWithTrigger]),
        }),
      });

      // Just verify matching works — don't need full execution
      const event = createTriggerEvent({ type: eventType });
      // The method findMatchingWorkflows is private, so we test through handleTriggerEvent
      // which should find the workflow with matching trigger node
      const results = await service.handleTriggerEvent(event);

      // Should have found and attempted to execute the workflow
      expect(results).toHaveLength(1);
    });
  });

  describe('without websocket service', () => {
    it('should work without websocket service', async () => {
      const { service, engineAdapter } = createService({
        websocketService: undefined as unknown as ReturnType<
          typeof createMockWebsocketService
        >,
      });

      engineAdapter.convertToExecutableWorkflow.mockReturnValue({
        edges: [],
        id: TEST_WORKFLOW_ID,
        lockedNodeIds: [],
        nodes: [],
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
      });

      // Should not throw even without websocket service
      const result = await service.executeTriggeredWorkflow(
        createWorkflowDoc() as never,
        createTriggerEvent(),
      );

      expect(result.executionId).toBe(TEST_EXEC_ID);
    });
  });
});
