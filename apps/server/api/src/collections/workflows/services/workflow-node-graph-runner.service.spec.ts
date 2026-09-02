import { WorkflowExecutionGraphService } from '@api/collections/workflows/services/workflow-execution-graph.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.types';
import { WorkflowNodeClaimLeaseLostError } from '@api/collections/workflows/services/workflow-node-claim.service';
import { WorkflowNodeGraphRunnerService } from '@api/collections/workflows/services/workflow-node-graph-runner.service';
import {
  createExecutableActionNode,
  type ExecutableWorkflow,
} from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowNodeGraphRunnerService — lost-lease catch path (#4307)', () => {
  const engineAdapter = { executeWorkflow: vi.fn() };
  const progressService = { trackNodeResult: vi.fn() };
  const nodeProgressTracker = {
    injectTriggerNode: vi.fn(),
    trackNodeFailed: vi.fn(),
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
