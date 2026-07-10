import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
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
  let executionsService: {
    findPendingReviewGateExecutions: ReturnType<typeof vi.fn>;
  };
  let executorService: { resolveTimedOutReviewGate: ReturnType<typeof vi.fn> };
  let provenanceService: { runAction: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    executionsService = {
      findPendingReviewGateExecutions: vi.fn().mockResolvedValue([]),
    };
    executorService = {
      resolveTimedOutReviewGate: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        nodeId: 'node-1',
        resolution: 'rejected',
      }),
    };
    provenanceService = {
      runAction: vi.fn(
        async (_input: unknown, action: () => Promise<unknown>) => ({
          provenance: {
            executionId: 'sys-exec',
            workflowId: 'sys-wf',
            workflowLabel: 'Review Gate Timeout Resolution',
          },
          result: await action(),
        }),
      ),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronReviewGateTimeoutService,
        { provide: WorkflowExecutionsService, useValue: executionsService },
        { provide: WorkflowExecutorService, useValue: executorService },
        {
          provide: SystemWorkflowProvenanceService,
          useValue: provenanceService,
        },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(CronReviewGateTimeoutService);
  });

  it('resolves gates whose timeout has elapsed inside a provenance action', async () => {
    executionsService.findPendingReviewGateExecutions.mockResolvedValue([
      gate(),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(provenanceService.runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REVIEW_GATE_TIMEOUT,
        organizationId: 'org-1',
      }),
      expect.any(Function),
    );
    expect(executorService.resolveTimedOutReviewGate).toHaveBeenCalledWith(
      'wf-1',
      'exec-1',
      'org-1',
      'node-1',
    );
  });

  it('skips gates whose timeout has not yet elapsed', async () => {
    executionsService.findPendingReviewGateExecutions.mockResolvedValue([
      gate({ requestedAt: new Date().toISOString(), timeoutHours: 24 }),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(executorService.resolveTimedOutReviewGate).not.toHaveBeenCalled();
  });

  it('isolates per-execution failures and keeps processing', async () => {
    executionsService.findPendingReviewGateExecutions.mockResolvedValue([
      gate({ executionId: 'exec-a', nodeId: 'node-a' }),
      gate({ executionId: 'exec-b', nodeId: 'node-b' }),
    ]);
    executorService.resolveTimedOutReviewGate
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        executionId: 'exec-b',
        nodeId: 'node-b',
        resolution: 'approved',
      });

    await service.resolveTimedOutReviewGates();

    expect(executorService.resolveTimedOutReviewGate).toHaveBeenCalledTimes(2);
    expect(loggerService.error).toHaveBeenCalledTimes(1);
  });

  it('ignores gates with an unparseable requestedAt', async () => {
    executionsService.findPendingReviewGateExecutions.mockResolvedValue([
      gate({ requestedAt: 'not-a-date' }),
    ]);

    await service.resolveTimedOutReviewGates();

    expect(executorService.resolveTimedOutReviewGate).not.toHaveBeenCalled();
  });
});
