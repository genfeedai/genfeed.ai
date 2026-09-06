import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowNodeClaimLeaseLostError } from '@api/collections/workflows/services/workflow-node-claim.service';
import { WorkflowNodeGraphRunnerService } from '@api/collections/workflows/services/workflow-node-graph-runner.service';
import {
  createExecutableActionNode,
  type ExecutableNode,
  type ExecutableWorkflow,
  type NodeExecutionResult,
} from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowNodeGraphRunnerService — lost-lease catch path (#4307)', () => {
  const engineAdapter = { executeNode: vi.fn(), executeWorkflow: vi.fn() };
  const progressService = { trackNodeResult: vi.fn() };
  const nodeProgressTracker = {
    injectTriggerNode: vi.fn(),
    trackNodeFailed: vi.fn(),
    trackNodeCompleted: vi.fn(),
    trackNodeStarted: vi.fn(),
  };
  const reviewGateService = { pauseForReviewGate: vi.fn() };
  const nodeClaimService = {
    complete: vi.fn(),
    runWithLeaseHeartbeat: vi.fn(),
    tryClaim: vi.fn(),
  };

  let runner: WorkflowNodeGraphRunnerService;

  const node = createExecutableActionNode({
    actionId: 'publish',
    id: 'publish',
    label: 'Publish',
  });

  const workflow: ExecutableWorkflow = {
    edges: [],
    emitSharedEvents: false,
    id: 'workflow-1',
    lockedNodeIds: [],
    nodes: [node],
    organizationId: 'org-1',
    userId: 'user-1',
    versionId: 'version-1',
  };

  const triggerEvent: TriggerEvent = {
    data: {},
    organizationId: 'org-1',
    platform: 'internal',
    type: 'manual',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    nodeProgressTracker.injectTriggerNode.mockResolvedValue(undefined);
    nodeProgressTracker.trackNodeStarted.mockResolvedValue(undefined);
    nodeProgressTracker.trackNodeFailed.mockResolvedValue(undefined);
    nodeClaimService.tryClaim.mockResolvedValue({
      action: 'claimed',
      lease: {
        executionId: 'execution-1',
        leaseOwnerId: 'owner-1',
        nodeId: 'publish',
        organizationId: 'org-1',
      },
    });
    runner = new WorkflowNodeGraphRunnerService(
      engineAdapter as never,
      new WorkflowExecutionGraphService(),
      progressService as never,
      nodeProgressTracker as never,
      reviewGateService as never,
      undefined,
      nodeClaimService as never,
      undefined,
    );
  });

  it('reruns a selected locked node while preserving workflow inputs and upstream cached media', async () => {
    const received: unknown[] = [];
    engineAdapter.executeNode.mockImplementation(
      async (
        current: ExecutableNode,
        inputs: Map<string, unknown>,
      ): Promise<NodeExecutionResult> => {
        received.push(inputs.get('language'), inputs.get('video'));
        return {
          nodeId: current.id,
          status: 'completed',
          output: 'new-speech',
          startedAt: new Date(),
          retryCount: 0,
          creditsUsed: 0,
        };
      },
    );
    const graph: ExecutableWorkflow = {
      ...workflow,
      lockedNodeIds: ['language', 'source', 'publish'],
      nodes: [
        {
          id: 'language',
          type: 'workflowInput',
          label: 'Language',
          config: {},
          isLocked: true,
          cachedOutput: 'es',
        },
        {
          ...node,
          id: 'source',
          isLocked: true,
          cachedOutput: { id: 'original-video' },
        },
        { ...node, isLocked: true, cachedOutput: 'old-speech' },
      ],
      edges: [
        {
          id: 'language-speech',
          source: 'language',
          target: 'publish',
          targetHandle: 'language',
        },
        {
          id: 'source-speech',
          source: 'source',
          target: 'publish',
          targetHandle: 'video',
        },
      ],
    };
    const graphRunner = new WorkflowNodeGraphRunnerService(
      engineAdapter as never,
      new WorkflowExecutionGraphService(),
      progressService as never,
      nodeProgressTracker as never,
      reviewGateService as never,
    );
    const result = await graphRunner.executeNodeGraph(
      graph,
      triggerEvent,
      'partial-execution',
      {
        startedAt: new Date(),
        workflowLabel: 'Localize',
        selectedNodeIds: ['publish'],
        respectLocks: false,
      },
    );
    expect(result.status).toBe('completed');
    expect(received).toEqual(['es', { id: 'original-video' }]);
    expect(engineAdapter.executeNode).toHaveBeenCalledTimes(1);
    expect(result.nodeResults.get('publish')?.output).toBe('new-speech');
  });

  it.each([null, 'prepare', 'infer', 'finalize'])(
    'runs the shared failure handler only for an actual failure (%s)',
    async (failedNode) => {
      const sources = ['prepare', 'infer', 'finalize'];
      const called: string[] = [];
      const failures: unknown[] = [];
      engineAdapter.executeNode.mockImplementation(
        async (
          current: ExecutableNode,
          inputs: Map<string, unknown>,
        ): Promise<NodeExecutionResult> => {
          called.push(current.id);
          if (current.id === 'fail-turn') failures.push(inputs.get('failure'));
          return {
            nodeId: current.id,
            status: current.id === failedNode ? 'failed' : 'completed',
            error: current.id === failedNode ? 'boom' : undefined,
            output: { failure: null, result: 'ok' },
            startedAt: new Date(),
            retryCount: 0,
            creditsUsed: 0,
          };
        },
      );
      const graph: ExecutableWorkflow = {
        ...workflow,
        nodes: [...sources, 'fail-turn'].map((id) =>
          createExecutableActionNode({ actionId: 'publish', id, label: id }),
        ),
        edges: [
          { id: 'prepare-infer', source: 'prepare', target: 'infer' },
          { id: 'infer-finalize', source: 'infer', target: 'finalize' },
          ...sources.map((source) => ({
            id: `${source}-failure`,
            source,
            sourceHandle: 'failure',
            target: 'fail-turn',
            targetHandle: 'failure',
          })),
        ],
      };
      const graphRunner = new WorkflowNodeGraphRunnerService(
        engineAdapter as never,
        new WorkflowExecutionGraphService(),
        progressService as never,
        nodeProgressTracker as never,
        reviewGateService as never,
      );
      await graphRunner.executeNodeGraph(graph, triggerEvent, 'execution-1', {
        startedAt: new Date(),
        workflowLabel: 'Agent turn',
      });
      expect(called).toEqual(
        failedNode
          ? [...sources.slice(0, sources.indexOf(failedNode) + 1), 'fail-turn']
          : sources,
      );
      expect(failures).toEqual(
        failedNode
          ? [
              expect.objectContaining({
                failedNodeId: failedNode,
                error: 'boom',
              }),
            ]
          : [],
      );
    },
  );

  it.each([false, true])(
    'restores failed status after delay resume (cached failure: %s)',
    async (cachedFailure) => {
      const failure = { error: 'boom', failedNodeId: 'work', nodeOutputs: {} };
      const called: string[] = [];
      const receivedFailures: unknown[] = [];
      engineAdapter.executeNode.mockImplementation(
        async (
          current: ExecutableNode,
          inputs: Map<string, unknown>,
        ): Promise<NodeExecutionResult> => {
          called.push(current.id);
          receivedFailures.push(inputs.get('failure'));
          return {
            nodeId: current.id,
            status: 'completed',
            output: {},
            startedAt: new Date(),
            retryCount: 0,
            creditsUsed: 0,
          };
        },
      );
      const resumedRunner = new WorkflowNodeGraphRunnerService(
        engineAdapter as never,
        new WorkflowExecutionGraphService(),
        progressService as never,
        nodeProgressTracker as never,
        reviewGateService as never,
        {
          findOne: vi.fn().mockResolvedValue({
            nodeResults: [
              {
                nodeId: 'work',
                status: 'failed',
                error: 'boom',
                creditsUsed: 0,
              },
              {
                nodeId: 'delay',
                status: 'completed',
                output: {},
                creditsUsed: 0,
              },
            ],
          }),
        } as never,
      );
      const graph: ExecutableWorkflow = {
        ...workflow,
        nodes: ['work', 'delay', 'handler'].map((id) =>
          createExecutableActionNode({ actionId: 'publish', id, label: id }),
        ),
        edges: [
          {
            id: 'failure-handler',
            source: 'work',
            sourceHandle: 'failure',
            target: 'handler',
            targetHandle: 'failure',
          },
          { id: 'delay-handler', source: 'delay', target: 'handler' },
        ],
      };
      await resumedRunner.executeNodeGraph(graph, triggerEvent, 'execution-1', {
        startedAt: new Date(),
        workflowLabel: 'Resumed workflow',
        nodeOutputCache: cachedFailure
          ? { work: { failure }, delay: {} }
          : { delay: {} },
      });
      expect(called).toEqual(['handler']);
      expect(receivedFailures).toEqual([
        expect.objectContaining({ error: 'boom', failedNodeId: 'work' }),
      ]);
    },
  );

  it('records the node as failed and never throws when the lease was lost, without a redundant stale-owner complete() write', async () => {
    nodeClaimService.runWithLeaseHeartbeat.mockRejectedValue(
      new WorkflowNodeClaimLeaseLostError({
        executionId: 'execution-1',
        nodeId: 'publish',
      }),
    );

    const result = await runner.executeNodeGraph(
      workflow,
      triggerEvent,
      'execution-1',
      {
        startedAt: new Date(),
        workflowLabel: 'Test workflow',
      },
    );

    expect(result.status).toBe('failed');
    expect(result.nodeResults.get('publish')?.status).toBe('failed');
    expect(result.nodeResults.get('publish')?.error).toContain(
      'Workflow node claim lease lost for execution-1/publish',
    );
    expect(nodeClaimService.complete).not.toHaveBeenCalled();
    expect(nodeProgressTracker.trackNodeFailed).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'publish' }),
    );
  });

  it('still calls complete() with the stale owner for a non-lease-lost failure', async () => {
    nodeClaimService.runWithLeaseHeartbeat.mockRejectedValue(
      new Error('provider timeout'),
    );
    nodeClaimService.complete.mockResolvedValue(undefined);

    const result = await runner.executeNodeGraph(
      workflow,
      triggerEvent,
      'execution-1',
      {
        startedAt: new Date(),
        workflowLabel: 'Test workflow',
      },
    );

    expect(result.status).toBe('failed');
    expect(nodeClaimService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        leaseOwnerId: 'owner-1',
        nodeId: 'publish',
        status: 'failed',
      }),
    );
  });
});
