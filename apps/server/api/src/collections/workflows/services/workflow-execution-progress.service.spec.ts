import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type { ExecutableWorkflow } from '@genfeedai/workflows/engine';
import { precomputeWorkflowEtaPlan } from '@helpers/generation-eta.helper';
import { WorkflowExecutionProgressService } from './workflow-execution-progress.service';

describe('WorkflowExecutionProgressService', () => {
  const workflow = {
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

  const makeService = () => {
    const executionsService = {
      updateExecutionProgress: vi.fn().mockResolvedValue({
        id: 'execution-1',
        progress: 50,
      }),
      updateNodeResult: vi.fn().mockResolvedValue({
        id: 'execution-1',
        progress: 50,
      }),
    };
    const logger = {
      error: vi.fn(),
    };
    const websocketService = {
      emit: vi.fn(),
      publishBackgroundTaskUpdate: vi.fn(),
    };

    return {
      executionsService,
      service: new WorkflowExecutionProgressService(
        executionsService as never,
        logger as never,
        websocketService as never,
      ),
      websocketService,
    };
  };

  it('precomputes the critical path once and writes scalar ETA progress', async () => {
    const { executionsService, service } = makeService();
    const plan = precomputeWorkflowEtaPlan(workflow.nodes, workflow.edges);
    service.rememberEtaPlan('execution-1', plan);

    await service.updateExecutionEta('execution-1', workflow, {
      completedNodeIds: ['image'],
      currentPhase: 'Generating Promo Video',
      startedAt: new Date(),
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Promo',
    });

    expect(executionsService.updateExecutionProgress).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        eta: expect.objectContaining({
          currentPhase: 'Generating Promo Video',
          remainingDurationMs: plan.nodeDurationsMs.video,
        }),
      }),
    );
  });

  it('throttles unchanged same-phase ETA writes', async () => {
    const { executionsService, service } = makeService();
    service.rememberEtaPlan(
      'execution-1',
      precomputeWorkflowEtaPlan(workflow.nodes, workflow.edges),
    );

    const options = {
      completedNodeIds: ['image'],
      currentPhase: 'Generating Promo Video',
      startedAt: new Date(),
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Promo',
    };

    await service.updateExecutionEta('execution-1', workflow, options);
    await service.updateExecutionEta('execution-1', workflow, options);

    expect(executionsService.updateExecutionProgress).toHaveBeenCalledTimes(1);
  });

  it('still persists when the phase changes during a throttle window', async () => {
    const { executionsService, service } = makeService();
    service.rememberEtaPlan(
      'execution-1',
      precomputeWorkflowEtaPlan(workflow.nodes, workflow.edges),
    );

    await service.updateExecutionEta('execution-1', workflow, {
      completedNodeIds: [],
      currentPhase: 'Running image',
      startedAt: new Date(),
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Promo',
    });
    await service.updateExecutionEta('execution-1', workflow, {
      completedNodeIds: ['image'],
      currentPhase: 'Completed image',
      startedAt: new Date(),
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Promo',
    });

    expect(executionsService.updateExecutionProgress).toHaveBeenCalledTimes(2);
  });

  it('tracks node results through the child-table upsert', async () => {
    const { executionsService, service } = makeService();

    await service.trackNodeResult('execution-1', 'image', 'ai-generate-image', {
      status: WorkflowExecutionStatus.COMPLETED,
    });

    expect(executionsService.updateNodeResult).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        nodeId: 'image',
        nodeType: 'ai-generate-image',
        status: WorkflowExecutionStatus.COMPLETED,
      }),
    );
  });
});
