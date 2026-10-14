import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import {
  buildReviewGateTimeoutResolveDefinition,
  buildReviewGateTimeoutSweepDefinition,
} from '@workers/crons/review-gate/review-gate-timeout-workflow-definition';

describe('review gate timeout workflows', () => {
  it('discovers timed-out gates and fans into the resolver workflow', () => {
    const sweep = buildReviewGateTimeoutSweepDefinition();
    expect(sweep.definition.nodes[1]?.data.config.actionId).toBe(
      'workflow.for-each-tenant',
    );
    expect(
      buildReviewGateTimeoutResolveDefinition().definition.nodes,
    ).toHaveLength(1);
  });
});

describe('CronReviewGateTimeoutService.resolveTimedOutReviewGates', () => {
  const HOUR_MS = 60 * 60 * 1000;

  function createService(
    pending: Array<{
      executionId: string;
      nodeId: string;
      organizationId: string;
      requestedAt: Date;
      timeoutHours: number;
      workflowId: string;
    }>,
  ) {
    const executorService = {
      findPendingReviewGateExecutions: vi.fn().mockResolvedValue(pending),
    };
    const workflowQueue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    const service = new CronReviewGateTimeoutService(
      executorService as never,
      { registerAction: vi.fn(), registerWorkflow: vi.fn() } as never,
      workflowQueue as never,
    );
    return { service, workflowQueue };
  }

  const gate = (requestedAt: Date) => ({
    executionId: 'execution-1',
    nodeId: 'review',
    organizationId: 'org-1',
    requestedAt,
    timeoutHours: 24,
    workflowId: 'workflow-1',
  });

  it('queues nothing when no gate is pending (#5634)', async () => {
    const { service, workflowQueue } = createService([]);

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('queues nothing when every pending gate is still within its timeout (#5634)', async () => {
    const { service, workflowQueue } = createService([
      gate(new Date(Date.now() - HOUR_MS)),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('queues the sweep when a gate has timed out', async () => {
    const { service, workflowQueue } = createService([
      gate(new Date(Date.now() - 25 * HOUR_MS)),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledOnce();
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'review_gate_timeout_sweep' }),
      expect.stringMatching(/^review-gate-timeout-sweep-\d+$/),
      expect.objectContaining({ attempts: 3 }),
    );
  });
});
