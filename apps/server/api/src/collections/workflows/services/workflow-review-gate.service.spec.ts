import { RetiredWorkflowExecutionError } from '@api/collections/workflows/services/workflow-executor-document.service';
import { WorkflowReviewGateService } from '@api/collections/workflows/services/workflow-review-gate.service';
import { WorkflowExecutionStatus, WorkflowStatus } from '@genfeedai/contracts';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
  let actorMembership: { isActiveMember: ReturnType<typeof vi.fn> };
  let service: WorkflowReviewGateService;

  beforeEach(() => {
    actorMembership = { isActiveMember: vi.fn().mockResolvedValue(true) };
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
      actorMembership as never,
    );
  });

  it.each(['human', 'timeout'] as const)(
    'keeps the recorded generation actor distinct from the %s reviewer',
    async (reviewer) => {
      const actor = ' recorded-review-actor ';
      executionsService.findOne.mockResolvedValue(
        buildExecution({ userId: actor }),
      );
      const doc = {
        id: WORKFLOW_ID,
        userId: 'creator',
        organizationId: ORGANIZATION_ID,
      };
      documentService.findPinnedWorkflow.mockResolvedValue(doc);
      const engine = {
        convertToExecutableWorkflow: vi.fn((workflow) => ({
          ...workflow,
          nodes: [],
          edges: [],
        })),
        applyRuntimeInputValues: vi.fn((_doc, workflow) => workflow),
      };
      const continueGraph = vi.fn().mockResolvedValue({ status: 'running' });
      finalizer.mapRunResultToExecutionStatus.mockReturnValue(
        WorkflowExecutionStatus.RUNNING,
      );
      const mounted = new WorkflowReviewGateService(
        engine as never,
        executionsService as never,
        documentService as never,
        {
          collectDownstreamNodeIds: vi.fn().mockReturnValue(['publish']),
        } as never,
        {} as never,
        finalizer as never,
        actorMembership as never,
        undefined,
        continueGraph,
      );
      if (reviewer === 'human') {
        const result = await mounted.submitReviewGateApproval(
          WORKFLOW_ID,
          EXECUTION_ID,
          'human-reviewer',
          ORGANIZATION_ID,
          NODE_ID,
          true,
        );
        expect(result.approvedBy).toBe('human-reviewer');
      } else
        await mounted.resolveTimedOutReviewGate(
          WORKFLOW_ID,
          EXECUTION_ID,
          ORGANIZATION_ID,
          NODE_ID,
        );
      expect(continueGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: expect.objectContaining({ userId: actor }),
          triggerEvent: expect.objectContaining({ userId: actor }),
        }),
      );
      expect(executionsService.updateExecutionMetadata).toHaveBeenCalledWith(
        EXECUTION_ID,
        expect.objectContaining({
          lastApproval: expect.objectContaining({
            approvedBy: reviewer === 'human' ? 'human-reviewer' : 'system',
          }),
        }),
      );
      expect(doc.userId).toBe('creator');
    },
  );

  it.each([undefined, null, 42, {}, '', '  \t'])(
    'blocks review approval with invalid recorded actor %j before hydration or claim',
    async (actor) => {
      executionsService.findOne.mockResolvedValue(
        buildExecution({ userId: actor }),
      );
      await expect(
        service.submitReviewGateApproval(
          WORKFLOW_ID,
          EXECUTION_ID,
          'human-reviewer',
          ORGANIZATION_ID,
          NODE_ID,
          true,
        ),
      ).rejects.toThrow(EXECUTION_ID);
      expect(documentService.findPinnedWorkflow).not.toHaveBeenCalled();
      expect(executionsService.claimPendingReviewGate).not.toHaveBeenCalled();
      expect(executionsService.updateNodeResult).not.toHaveBeenCalled();
      expect(finalizer.finalizeExecution).not.toHaveBeenCalled();
    },
  );

  it('surfaces an invalid timeout actor instead of treating corruption as a claim race', async () => {
    executionsService.findOne.mockResolvedValue(
      buildExecution({ userId: null }),
    );
    await expect(
      service.resolveTimedOutReviewGate(
        WORKFLOW_ID,
        EXECUTION_ID,
        ORGANIZATION_ID,
        NODE_ID,
      ),
    ).rejects.toThrow(EXECUTION_ID);
    expect(executionsService.claimPendingReviewGate).not.toHaveBeenCalled();
    expect(finalizer.finalizeExecution).not.toHaveBeenCalled();
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

  describe('recorded actor removed from the organization (#5892)', () => {
    it('fails the run and denies a human approval without resuming the graph', async () => {
      actorMembership.isActiveMember.mockResolvedValue(false);

      await expect(
        service.submitReviewGateApproval(
          WORKFLOW_ID,
          EXECUTION_ID,
          'reviewer-1',
          ORGANIZATION_ID,
          NODE_ID,
          true,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(actorMembership.isActiveMember).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        'execution-user-1',
      );
      expect(executionsService.updateNodeResult).toHaveBeenCalledWith(
        EXECUTION_ID,
        expect.objectContaining({
          error: expect.stringContaining('no longer an active member'),
          status: WorkflowExecutionStatus.FAILED,
        }),
      );
      expect(finalizer.finalizeExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          finalStatus: WorkflowExecutionStatus.FAILED,
        }),
      );
      expect(finalizer.mapRunResultToExecutionStatus).not.toHaveBeenCalled();
      expect(
        executionsService.completePendingReviewGateClaim,
      ).toHaveBeenCalled();
      expect(
        executionsService.releasePendingReviewGateClaim,
      ).not.toHaveBeenCalled();
    });

    it('fails the run instead of auto-approving on timeout', async () => {
      actorMembership.isActiveMember.mockResolvedValue(false);

      const resolution = await service.resolveTimedOutReviewGate(
        WORKFLOW_ID,
        EXECUTION_ID,
        ORGANIZATION_ID,
        NODE_ID,
      );

      expect(resolution).toEqual({
        executionId: EXECUTION_ID,
        nodeId: NODE_ID,
        resolution: 'rejected',
      });
      expect(finalizer.finalizeExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          finalStatus: WorkflowExecutionStatus.FAILED,
        }),
      );
      expect(finalizer.mapRunResultToExecutionStatus).not.toHaveBeenCalled();
    });

    it('still lets a reviewer reject the paused run', async () => {
      actorMembership.isActiveMember.mockResolvedValue(false);

      const result = await service.submitReviewGateApproval(
        WORKFLOW_ID,
        EXECUTION_ID,
        'reviewer-1',
        ORGANIZATION_ID,
        NODE_ID,
        false,
        'not good enough',
      );

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('not good enough');
    });
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
      expect.any(String),
    );
    expect(executionsService.updateNodeResult).toHaveBeenCalledTimes(1);
    expect(finalizer.finalizeExecution).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicit audio preview type through a review decision', async () => {
    const execution = buildExecution();
    executionsService.findOne.mockResolvedValue({
      ...execution,
      metadata: {
        pendingApproval: {
          ...execution.metadata.pendingApproval,
          inputMedia: 'https://cdn.example/extensionless-background',
          rawMedia: {
            id: 'background',
            audioUrl: 'https://cdn.example/extensionless-background',
          },
        },
      },
    });
    await service.submitReviewGateApproval(
      WORKFLOW_ID,
      EXECUTION_ID,
      'user-1',
      ORGANIZATION_ID,
      NODE_ID,
      false,
    );
    expect(executionsService.updateNodeResult).toHaveBeenCalledWith(
      EXECUTION_ID,
      expect.objectContaining({
        output: expect.objectContaining({ inputType: 'audio' }),
      }),
    );
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
