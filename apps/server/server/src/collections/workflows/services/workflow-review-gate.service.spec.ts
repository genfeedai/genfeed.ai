import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { RetiredWorkflowExecutionError } from '@server/collections/workflows/services/workflow-executor-document.service';
import { WorkflowReviewGateService } from '@server/collections/workflows/services/workflow-review-gate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKFLOW_ID = 'workflow-1';
const EXECUTION_ID = 'execution-1';
const ORGANIZATION_ID = 'org-1';
const NODE_ID = 'review-gate-node';

function buildExecution(overrides: Record<string, unknown> = {}) {
  return {
    completedAt: null,
    id: EXECUTION_ID,
    metadata: {
      pendingApproval: {
        autoApproveIfNoResponse: true,
        nodeId: NODE_ID,
        notifyChannels: [],
        requestedAt: new Date().toISOString(),
        timeoutHours: 1,
      },
    },
    nodeResults: [],
    startedAt: new Date('2026-08-28T10:00:00.000Z'),
    status: WorkflowExecutionStatus.RUNNING,
    userId: 'execution-user-1',
    workflowId: WORKFLOW_ID,
    workflowVersionId: 'workflow-version-1',
    ...overrides,
  };
}

describe('WorkflowReviewGateService — atomic gate claim', () => {
  let executionsService: {
    claimPendingReviewGate: ReturnType<typeof vi.fn>;
    completePendingReviewGateClaim: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    releasePendingReviewGateClaim: ReturnType<typeof vi.fn>;
    updateExecutionMetadata: ReturnType<typeof vi.fn>;
    updateNodeResult: ReturnType<typeof vi.fn>;
  };
  let finalizer: {
    finalizeExecution: ReturnType<typeof vi.fn>;
    mapRunResultToExecutionStatus: ReturnType<typeof vi.fn>;
  };
  let documentService: {
    findPinnedWorkflow: ReturnType<typeof vi.fn>;
    getWorkflowLabel: ReturnType<typeof vi.fn>;
    normalizeWorkflowDocument: ReturnType<typeof vi.fn>;
  };
  let service: WorkflowReviewGateService;

  beforeEach(() => {
    executionsService = {
      claimPendingReviewGate: vi.fn().mockResolvedValue(true),
      completePendingReviewGateClaim: vi.fn().mockResolvedValue(true),
      findOne: vi.fn().mockResolvedValue(buildExecution()),
      releasePendingReviewGateClaim: vi.fn().mockResolvedValue(true),
      updateExecutionMetadata: vi.fn().mockResolvedValue(null),
      updateNodeResult: vi.fn().mockResolvedValue(null),
    };
    finalizer = {
      finalizeExecution: vi.fn().mockResolvedValue({
        id: EXECUTION_ID,
        metadata: {},
      }),
      mapRunResultToExecutionStatus: vi
        .fn()
        .mockReturnValue(WorkflowExecutionStatus.COMPLETED),
    };
    documentService = {
      findPinnedWorkflow: vi.fn().mockResolvedValue({
        id: WORKFLOW_ID,
        label: 'Test Workflow',
      }),
      getWorkflowLabel: vi.fn().mockReturnValue('Test Workflow'),
      normalizeWorkflowDocument: vi.fn().mockImplementation((doc) => doc),
    };
    service = new WorkflowReviewGateService(
      {} as never,
      executionsService as never,
      documentService as never,
      {} as never,
      {
        clearEtaPlan: vi.fn(),
        extractEtaFromMetadata: vi.fn(),
        publishWorkflowStatus: vi.fn(),
        publishWorkflowTaskUpdate: vi.fn(),
      } as never,
      finalizer as never,
    );
  });

  it('rejects a human approval when the gate was already claimed by another resolver', async () => {
    executionsService.claimPendingReviewGate.mockResolvedValue(false);

    await expect(
      service.submitReviewGateApproval(
        WORKFLOW_ID,
        EXECUTION_ID,
        'user-1',
        ORGANIZATION_ID,
        NODE_ID,
        false,
        'not good enough',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(executionsService.claimPendingReviewGate).toHaveBeenCalledWith(
      EXECUTION_ID,
      NODE_ID,
      expect.any(String),
    );
    // Losing the claim must short-circuit before any resolution writes.
    expect(executionsService.updateNodeResult).not.toHaveBeenCalled();
    expect(finalizer.finalizeExecution).not.toHaveBeenCalled();
  });

  it('returns a client error when the pinned workflow was retired', async () => {
    documentService.findPinnedWorkflow.mockRejectedValue(
      new RetiredWorkflowExecutionError(WORKFLOW_ID, 'workflow-version-1'),
    );

    await expect(
      service.submitReviewGateApproval(
        WORKFLOW_ID,
        EXECUTION_ID,
        'user-1',
        ORGANIZATION_ID,
        NODE_ID,
        true,
      ),
    ).rejects.toMatchObject({
      message:
        'Workflow workflow-1 is retired and cannot resume pinned version workflow-version-1',
      status: 400,
    });
    expect(executionsService.claimPendingReviewGate).not.toHaveBeenCalled();
  });

  it('returns null from the timeout sweep when a human wins the claim race', async () => {
    executionsService.claimPendingReviewGate.mockResolvedValue(false);

    const resolution = await service.resolveTimedOutReviewGate(
      WORKFLOW_ID,
      EXECUTION_ID,
      ORGANIZATION_ID,
      NODE_ID,
    );

    expect(resolution).toBeNull();
    expect(executionsService.updateNodeResult).not.toHaveBeenCalled();
  });

  it.each(['human', 'timeout'] as const)(
    'allows exactly one resolution when %s wins a human/timeout race',
    async (winner) => {
      executionsService.findOne.mockResolvedValue(
        buildExecution({
          metadata: {
            pendingApproval: {
              autoApproveIfNoResponse: false,
              nodeId: NODE_ID,
              notifyChannels: [],
              requestedAt: new Date().toISOString(),
              timeoutHours: 1,
            },
          },
        }),
      );

      let releaseWinner!: () => void;
      const winnerCanFinish = new Promise<void>((resolve) => {
        releaseWinner = resolve;
      });
      executionsService.claimPendingReviewGate
        .mockImplementationOnce(async () => {
          await winnerCanFinish;
          return true;
        })
        .mockResolvedValueOnce(false);

      const resolveAsHuman = () =>
        service.submitReviewGateApproval(
          WORKFLOW_ID,
          EXECUTION_ID,
          'user-1',
          ORGANIZATION_ID,
          NODE_ID,
          false,
          'needs changes',
        );
      const resolveAsTimeout = () =>
        service.resolveTimedOutReviewGate(
          WORKFLOW_ID,
          EXECUTION_ID,
          ORGANIZATION_ID,
          NODE_ID,
        );

      const winningResolution =
        winner === 'human' ? resolveAsHuman() : resolveAsTimeout();
      await vi.waitFor(() =>
        expect(executionsService.claimPendingReviewGate).toHaveBeenCalledTimes(
          1,
        ),
      );

      const losingResolution =
        winner === 'human' ? resolveAsTimeout() : resolveAsHuman();
      void losingResolution.catch(() => undefined);
      await vi.waitFor(() =>
        expect(executionsService.claimPendingReviewGate).toHaveBeenCalledTimes(
          2,
        ),
      );
      releaseWinner();

      const [winningResult, losingResult] = await Promise.allSettled([
        winningResolution,
        losingResolution,
      ]);

      expect(winningResult).toMatchObject({
        status: 'fulfilled',
        value:
          winner === 'human'
            ? expect.objectContaining({ status: 'rejected' })
            : expect.objectContaining({ resolution: 'rejected' }),
      });
      if (winner === 'human') {
        expect(losingResult).toMatchObject({
          status: 'fulfilled',
          value: null,
        });
      } else {
        expect(losingResult).toMatchObject({
          reason: expect.any(BadRequestException),
          status: 'rejected',
        });
      }
      expect(executionsService.updateNodeResult).toHaveBeenCalledTimes(1);
      expect(finalizer.finalizeExecution).toHaveBeenCalledTimes(1);
      expect(
        executionsService.completePendingReviewGateClaim,
      ).toHaveBeenCalledTimes(1);
    },
  );

  it('resolves a rejection normally when the claim succeeds', async () => {
    const result = await service.submitReviewGateApproval(
      WORKFLOW_ID,
      EXECUTION_ID,
      'user-1',
      ORGANIZATION_ID,
      NODE_ID,
      false,
      'not good enough',
    );

    expect(result.status).toBe('rejected');
    expect(executionsService.claimPendingReviewGate).toHaveBeenCalledWith(
      EXECUTION_ID,
      NODE_ID,
      expect.any(String),
    );
    expect(executionsService.updateNodeResult).toHaveBeenCalledTimes(1);
    expect(finalizer.finalizeExecution).toHaveBeenCalledTimes(1);
  });

  it('keeps a reusable system workflow active when one execution is rejected', async () => {
    executionsService.findOne.mockResolvedValue(
      buildExecution({
        metadata: {
          isSystemAction: true,
          pendingApproval: {
            autoApproveIfNoResponse: false,
            nodeId: NODE_ID,
            notifyChannels: [],
            requestedAt: new Date().toISOString(),
            timeoutHours: 1,
          },
        },
      }),
    );

    await service.submitReviewGateApproval(
      WORKFLOW_ID,
      EXECUTION_ID,
      'user-1',
      ORGANIZATION_ID,
      NODE_ID,
      false,
      'regenerate the hook',
    );

    expect(finalizer.finalizeExecution).toHaveBeenCalledWith(
      expect.objectContaining({ workflowStatus: WorkflowStatus.ACTIVE }),
    );
  });

  it('releases the gate claim when finalization fails so approval can retry', async () => {
    finalizer.finalizeExecution.mockRejectedValueOnce(
      new Error('temporary finalizer failure'),
    );

    await expect(
      service.submitReviewGateApproval(
        WORKFLOW_ID,
        EXECUTION_ID,
        'user-1',
        ORGANIZATION_ID,
        NODE_ID,
        false,
      ),
    ).rejects.toThrow('temporary finalizer failure');

    const claimToken =
      executionsService.claimPendingReviewGate.mock.calls[0]?.[2];
    expect(
      executionsService.releasePendingReviewGateClaim,
    ).toHaveBeenCalledWith(EXECUTION_ID, NODE_ID, claimToken);
    expect(
      executionsService.completePendingReviewGateClaim,
    ).not.toHaveBeenCalled();
  });
});
