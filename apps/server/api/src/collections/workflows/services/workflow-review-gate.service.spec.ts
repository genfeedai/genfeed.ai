import { WorkflowReviewGateService } from '@api/collections/workflows/services/workflow-review-gate.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
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
    status: WorkflowExecutionStatus.RUNNING,
    workflowId: WORKFLOW_ID,
    ...overrides,
  };
}

describe('WorkflowReviewGateService — atomic gate claim', () => {
  let executionsService: {
    claimPendingReviewGate: ReturnType<typeof vi.fn>;
    completeExecution: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    setFailedNodeId: ReturnType<typeof vi.fn>;
    updateExecutionMetadata: ReturnType<typeof vi.fn>;
    updateNodeResult: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    workflow: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let documentService: {
    getWorkflowLabel: ReturnType<typeof vi.fn>;
    normalizeWorkflowDocument: ReturnType<typeof vi.fn>;
  };
  let service: WorkflowReviewGateService;

  beforeEach(() => {
    executionsService = {
      claimPendingReviewGate: vi.fn().mockResolvedValue(true),
      completeExecution: vi.fn().mockResolvedValue(null),
      findOne: vi.fn().mockResolvedValue(buildExecution()),
      setFailedNodeId: vi.fn().mockResolvedValue(null),
      updateExecutionMetadata: vi.fn().mockResolvedValue(null),
      updateNodeResult: vi.fn().mockResolvedValue(null),
    };
    prisma = {
      workflow: {
        findFirst: vi.fn().mockResolvedValue({ id: WORKFLOW_ID }),
        update: vi.fn().mockResolvedValue({ id: WORKFLOW_ID }),
      },
    };
    documentService = {
      getWorkflowLabel: vi.fn().mockReturnValue('Test Workflow'),
      normalizeWorkflowDocument: vi.fn().mockImplementation((doc) => doc),
    };
    service = new WorkflowReviewGateService(
      prisma as never,
      {} as never,
      executionsService as never,
      documentService as never,
      {} as never,
      {} as never,
      {} as never,
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
    );
    // Losing the claim must short-circuit before any resolution writes.
    expect(executionsService.updateNodeResult).not.toHaveBeenCalled();
    expect(executionsService.completeExecution).not.toHaveBeenCalled();
    expect(prisma.workflow.update).not.toHaveBeenCalled();
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

  it.each([
    'human',
    'timeout',
  ] as const)('allows exactly one resolution when %s wins a human/timeout race', async (winner) => {
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
      expect(executionsService.claimPendingReviewGate).toHaveBeenCalledTimes(1),
    );

    const losingResolution =
      winner === 'human' ? resolveAsTimeout() : resolveAsHuman();
    void losingResolution.catch(() => undefined);
    await vi.waitFor(() =>
      expect(executionsService.claimPendingReviewGate).toHaveBeenCalledTimes(2),
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
    expect(executionsService.completeExecution).toHaveBeenCalledTimes(1);
    expect(prisma.workflow.update).toHaveBeenCalledTimes(1);
  });

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
    );
    expect(executionsService.updateNodeResult).toHaveBeenCalledTimes(1);
    expect(executionsService.completeExecution).toHaveBeenCalledTimes(1);
  });
});
