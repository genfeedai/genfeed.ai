import type { WorkflowExecutionEtaUpdate } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { ExecutableWorkflow } from '@genfeedai/workflows/engine';
import { precomputeWorkflowEtaPlan } from '@helpers/generation-eta.helper';
import { WorkflowExecutionProgressService } from './workflow-execution-progress.service';

interface StoredExecution {
  creditsByNode: Record<string, number | undefined>;
  eta: WorkflowExecutionEtaUpdate;
  isNodeWriteDown: boolean;
  progress: number;
  statements: number;
  statusByNode: Record<string, string>;
}

/**
 * A stand-in for the executions table: each method is one SQL statement, so
 * `statements` counts database round trips and the rest is the persisted row.
 */
function createExecutionStore() {
  const execution: StoredExecution = {
    creditsByNode: {},
    eta: {},
    isNodeWriteDown: false,
    progress: 0,
    statements: 0,
    statusByNode: {},
  };
  const executionsService = {
    updateExecutionProgress: async (
      id: string,
      _organizationId: string,
      update: { eta?: WorkflowExecutionEtaUpdate; progress?: number },
    ) => {
      execution.statements++;
      execution.eta = { ...execution.eta, ...update.eta };
      execution.progress = update.progress ?? execution.progress;
      return { id, metadata: {}, progress: execution.progress };
    },
    updateNodeResult: async (
      id: string,
      nodeResult: { creditsUsed?: number; nodeId: string; status: string },
      _totalNodes?: number,
      eta?: WorkflowExecutionEtaUpdate,
    ) => {
      if (execution.isNodeWriteDown) {
        throw new Error('database unavailable');
      }
      execution.statements++;
      execution.statusByNode[nodeResult.nodeId] = nodeResult.status;
      execution.creditsByNode[nodeResult.nodeId] = nodeResult.creditsUsed;
      execution.eta = { ...execution.eta, ...eta };
      execution.progress = 50;
      return { id, metadata: {}, progress: execution.progress };
    },
  };
  const published: Array<Record<string, unknown>> = [];
  const websocketService = {
    emit: async () => undefined,
    publishBackgroundTaskUpdate: async (update: Record<string, unknown>) => {
      published.push(update);
    },
  };
  const service = new WorkflowExecutionProgressService(
    executionsService as never,
    { error: () => undefined } as never,
    websocketService as never,
  );
  return { execution, published, service };
}

describe('WorkflowExecutionProgressService', () => {
  const workflow = {
    organizationId: 'org-1',
    edges: [{ source: 'image', target: 'video' }],
    nodes: [
      {
        config: { model: 'imagen4', prompt: 'cover' },
        id: 'image',
        type: 'ai-generate-image',
      },
      {
        config: { duration: 10, model: 'klingai', prompt: 'promo' },
        id: 'video',
        type: 'ai-generate-video',
      },
    ],
  } as unknown as ExecutableWorkflow;
  const etaOptions = {
    completedNodeIds: ['image'],
    currentPhase: 'Generating Promo Video',
    startedAt: new Date(),
    userId: 'user-1',
    workflowId: 'workflow-1',
    workflowLabel: 'Promo',
  };
  const runningImage = {
    nodeId: 'image',
    nodeType: 'ai-generate-image',
    updates: { status: WorkflowExecutionStatus.RUNNING },
  };
  const runningImageEta = {
    ...etaOptions,
    completedNodeIds: [],
    currentPhase: 'Running image',
  };

  it('precomputes the critical path once and writes scalar ETA progress', async () => {
    const { execution, service } = createExecutionStore();
    const plan = precomputeWorkflowEtaPlan(workflow.nodes, workflow.edges);
    service.rememberEtaPlan('execution-1', plan);

    await service.updateExecutionEta('execution-1', workflow, etaOptions);

    expect(execution.eta).toMatchObject({
      currentPhase: 'Generating Promo Video',
      remainingDurationMs: plan.nodeDurationsMs.video,
    });
  });

  it('throttles unchanged same-phase ETA writes but still publishes them', async () => {
    const { execution, published, service } = createExecutionStore();

    await service.updateExecutionEta('execution-1', workflow, etaOptions);
    await service.updateExecutionEta('execution-1', workflow, etaOptions);

    expect(execution.statements).toBe(1);
    expect(published).toHaveLength(2);
  });

  it('still persists when the phase changes during a throttle window', async () => {
    const { execution, service } = createExecutionStore();

    await service.updateExecutionEta('execution-1', workflow, runningImageEta);
    await service.updateExecutionEta('execution-1', workflow, {
      ...etaOptions,
      currentPhase: 'Completed image',
    });

    expect(execution.statements).toBe(2);
    expect(execution.eta.currentPhase).toBe('Completed image');
  });

  it('tracks node results through the child-table upsert', async () => {
    const { execution, service } = createExecutionStore();

    const tracked = await service.trackNodeResult(
      'execution-1',
      'image',
      'ai-generate-image',
      { creditsUsed: 10, status: WorkflowExecutionStatus.COMPLETED },
    );

    expect(tracked?.progress).toBe(50);
    expect(execution.statusByNode).toEqual({
      image: WorkflowExecutionStatus.COMPLETED,
    });
    expect(execution.creditsByNode).toEqual({ image: 10 });
  });

  it('writes a node transition and its ETA in one statement', async () => {
    const { execution, published, service } = createExecutionStore();

    await service.trackNodeProgress(
      'execution-1',
      workflow,
      runningImage,
      runningImageEta,
    );

    expect(execution.statements).toBe(1);
    expect(execution.statusByNode).toEqual({
      image: WorkflowExecutionStatus.RUNNING,
    });
    expect(execution.eta.currentPhase).toBe('Running image');
    expect(published).toEqual([
      expect.objectContaining({
        currentPhase: 'Running image',
        progress: 50,
        status: 'processing',
        taskId: 'execution-1',
      }),
    ]);
  });

  it('writes the ETA on its own when the node write fails', async () => {
    const { execution, published, service } = createExecutionStore();
    execution.isNodeWriteDown = true;

    await service.trackNodeProgress('execution-1', workflow, runningImage, {
      ...runningImageEta,
      progressFallback: 20,
    });

    expect(execution.statements).toBe(1);
    expect(execution.eta.currentPhase).toBe('Running image');
    expect(execution.progress).toBe(20);
    expect(published).toEqual([expect.objectContaining({ progress: 20 })]);
  });
});
