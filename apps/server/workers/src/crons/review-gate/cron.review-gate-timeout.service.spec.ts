import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  type SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOUR_MS = 60 * 60 * 1000;

function gate(overrides: Record<string, unknown> = {}) {
  return {
    autoApproveIfNoResponse: false,
    executionId: 'exec-1',
    nodeId: 'node-1',
    organizationId: 'org-1',
    requestedAt: new Date(Date.now() - 100 * HOUR_MS).toISOString(),
    timeoutHours: 24,
    workflowId: 'wf-1',
    ...overrides,
  };
}

describe('CronReviewGateTimeoutService', () => {
  let service: CronReviewGateTimeoutService;
  let executorService: {
    findPendingReviewGateExecutions: ReturnType<typeof vi.fn>;
    resolveTimedOutReviewGate: ReturnType<typeof vi.fn>;
  };
  let actionExecutor: SystemWorkflowActionExecutor;
  let provenanceService: { registerAction: ReturnType<typeof vi.fn> };
  let workflowQueue: { queueSystemAction: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    executorService = {
      findPendingReviewGateExecutions: vi.fn().mockResolvedValue([]),
      resolveTimedOutReviewGate: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        nodeId: 'node-1',
        resolution: 'rejected',
      }),
    };
    provenanceService = {
      registerAction: vi.fn(
        (_actionId: string, executor: SystemWorkflowActionExecutor) => {
          actionExecutor = executor;
        },
      ),
    };
    workflowQueue = {
      queueSystemAction: vi.fn(
        async (input: { inputValues?: Record<string, unknown> }) =>
          actionExecutor({
            context: {} as never,
            input: input.inputValues ?? {},
            provenance: {
              executionId: 'sys-exec',
              workflowId: 'sys-wf',
              workflowLabel: 'Review Gate Timeout Resolution',
            },
          }),
      ),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronReviewGateTimeoutService,
        { provide: WorkflowExecutorService, useValue: executorService },
        {
          provide: SystemWorkflowRunnerService,
          useValue: provenanceService,
        },
        { provide: WorkflowExecutionQueueService, useValue: workflowQueue },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(CronReviewGateTimeoutService);
    service.onModuleInit();
  });

  it('resolves gates whose timeout has elapsed inside a provenance action', async () => {
    executorService.findPendingReviewGateExecutions.mockResolvedValue([gate()]);

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REVIEW_GATE_TIMEOUT,
        organizationId: 'org-1',
      }),
      expect.any(String),
    );
    expect(executorService.resolveTimedOutReviewGate).toHaveBeenCalledWith(
      'wf-1',
      'exec-1',
      'org-1',
      'node-1',
    );
  });

  it('skips gates whose timeout has not yet elapsed', async () => {
    executorService.findPendingReviewGateExecutions.mockResolvedValue([
      gate({ requestedAt: new Date().toISOString(), timeoutHours: 24 }),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemAction).not.toHaveBeenCalled();
  });

  it('isolates per-execution failures and keeps processing', async () => {
    executorService.findPendingReviewGateExecutions.mockResolvedValue([
      gate({ executionId: 'exec-a', nodeId: 'node-a' }),
      gate({ executionId: 'exec-b', nodeId: 'node-b' }),
    ]);
    workflowQueue.queueSystemAction
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(
        async (input: { inputValues?: Record<string, unknown> }) =>
          actionExecutor({
            context: {} as never,
            input: input.inputValues ?? {},
            provenance: {
              executionId: 'sys-exec',
              workflowId: 'sys-wf',
              workflowLabel: 'Review Gate Timeout Resolution',
            },
          }),
      );

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemAction).toHaveBeenCalledTimes(2);
    expect(loggerService.error).toHaveBeenCalledTimes(1);
  });

  it('ignores gates with an unparseable requestedAt', async () => {
    executorService.findPendingReviewGateExecutions.mockResolvedValue([
      gate({ requestedAt: 'not-a-date' }),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(workflowQueue.queueSystemAction).not.toHaveBeenCalled();
  });
});
