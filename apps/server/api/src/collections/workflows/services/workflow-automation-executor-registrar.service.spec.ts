import { WorkflowAutomationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-automation-executor-registrar.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

/**
 * #3018: the content loop autopilot workflow's `harnessWinnerPromotionSweep`
 * node must be wired to `WinnerPromotionWorkflowService`, and degrade to a
 * diagnosable skip (never a thrown "no executor registered") when the
 * service is unavailable — same contract as every sibling automation node.
 */
describe('WorkflowAutomationExecutorRegistrarService — winner promotion', () => {
  const helper = {
    wrapEngineExecutor: () => async () => ({}),
  } as unknown as WorkflowEngineExecutorHelperService;

  function register(winnerPromotionWorkflowService?: unknown): WorkflowEngine {
    const engine = new WorkflowEngine();
    new WorkflowAutomationExecutorRegistrarService(
      helper,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      winnerPromotionWorkflowService as never,
    ).register(engine);
    return engine;
  }

  it('registers the harnessWinnerPromotionSweep node type', () => {
    const engine = register({
      runOrganizationWinnerPromotion: vi.fn(),
    });

    expect(engine.getRegisteredNodeTypes()).toContain(
      'harnessWinnerPromotionSweep',
    );
  });

  it('delegates to WinnerPromotionWorkflowService.runOrganizationWinnerPromotion scoped to the run organization', async () => {
    const runOrganizationWinnerPromotion = vi.fn().mockResolvedValue({
      action: 'harnessWinnerPromotionSweep',
      brandsEligible: 1,
      brandsFailed: 0,
      brandsPromoted: 1,
      organizationId: 'org-1',
      promoted: 3,
      status: 'completed',
    });
    const engine = register({ runOrganizationWinnerPromotion });

    const executor = engine.getExecutor('harnessWinnerPromotionSweep');
    const output = await executor?.(
      {
        config: {},
        id: 'n1',
        inputs: [],
        label: 'n1',
        type: 'harnessWinnerPromotionSweep',
      },
      new Map(),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'wf-1',
      },
    );

    expect(runOrganizationWinnerPromotion).toHaveBeenCalledWith('org-1');
    expect(output).toMatchObject({ promoted: 3, status: 'completed' });
  });

  it('skips diagnosably instead of throwing when the service is unavailable', async () => {
    const engine = register(undefined);

    const executor = engine.getExecutor('harnessWinnerPromotionSweep');
    const output = await executor?.(
      {
        config: {},
        id: 'n1',
        inputs: [],
        label: 'n1',
        type: 'harnessWinnerPromotionSweep',
      },
      new Map(),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'wf-1',
      },
    );

    expect(output).toMatchObject({
      reason: 'winner_promotion_service_unavailable',
      status: 'skipped',
    });
  });
});
