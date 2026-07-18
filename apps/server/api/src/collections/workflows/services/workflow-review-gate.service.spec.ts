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

  it('allows exactly one resolution when a human and timeout sweep race', async () => {
    executionsService.claimPendingReviewGate
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const [humanResolution, timeoutResolution] = await Promise.all([
      service.submitReviewGateApproval(
        WORKFLOW_ID,
        EXECUTION_ID,
        'user-1',
        ORGANIZATION_ID,
        NODE_ID,
        false,
        'needs changes',
      ),
      service.resolveTimedOutReviewGate(
        WORKFLOW_ID,
        EXECUTION_ID,
        ORGANIZATION_ID,
        NODE_ID,
      ),
    ]);

    expect(humanResolution.status).toBe('rejected');
    expect(timeoutResolution).toBeNull();
    expect(executionsService.claimPendingReviewGate).toHaveBeenCalledTimes(2);
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
