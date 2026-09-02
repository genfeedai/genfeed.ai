import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowNodeContinuationCoordinatorService', () => {
  const continuations = {
    claimProviderSettlement: vi.fn(),
    findReconciliationCandidates: vi.fn(),
    markSettlementFinished: vi.fn(),
    reconcileHeygenPollTransport: vi.fn(),
    recordProviderSettlement: vi.fn(),
  };
  const nodeClaims = { complete: vi.fn() };
  const executions = { updateNodeResult: vi.fn() };
  const workflowExecutor = { continueProviderCallbackExecution: vi.fn() };
  const logger = { error: vi.fn() };
  let coordinator: WorkflowNodeContinuationCoordinatorService;

  beforeEach(() => {
    vi.clearAllMocks();
    continuations.reconcileHeygenPollTransport.mockResolvedValue(0);
    continuations.findReconciliationCandidates.mockResolvedValue([]);
    coordinator = new WorkflowNodeContinuationCoordinatorService(
      continuations as never,
      nodeClaims as never,
      executions as never,
      workflowExecutor as never,
      logger as never,
    );
  });

  it('persists callback settlement without holding the provider request through graph resume', async () => {
    continuations.recordProviderSettlement.mockResolvedValue('recorded');

    await expect(
      coordinator.completeProviderAction({
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        provider: 'replicate',
        providerResult: { externalId: 'prediction-1' },
      }),
    ).resolves.toBe('queued');
    expect(
      workflowExecutor.continueProviderCallbackExecution,
    ).not.toHaveBeenCalled();
  });

  it('reconciles one exact successful continuation onto its pinned execution', async () => {
    continuations.findReconciliationCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-1',
        organizationId: 'org-1',
        provider: 'replicate',
        succeeded: true,
      },
    ]);
    continuations.claimProviderSettlement.mockResolvedValue({
      actionId: 'imageGen',
      continuationId: 'continuation-1',
      creditsUsed: 5,
      executionId: 'execution-1',
      finalOutput: { id: 'ingredient-1', status: 'GENERATED' },
      ingredientId: 'ingredient-1',
      kind: 'claimed',
      nodeId: 'generate',
      organizationId: 'org-1',
      workflowVersionId: 'version-1',
    });

    await expect(coordinator.reconcileProviderContinuations()).resolves.toEqual(
      {
        failed: 0,
        pollsDispatched: 0,
        resumed: 1,
      },
    );
    expect(
      workflowExecutor.continueProviderCallbackExecution,
    ).toHaveBeenCalledWith({
      executionId: 'execution-1',
      organizationId: 'org-1',
      workflowVersionId: 'version-1',
    });
    expect(continuations.markSettlementFinished).toHaveBeenCalledWith({
      continuationId: 'continuation-1',
      organizationId: 'org-1',
      succeeded: true,
    });
  });

  it('makes a duplicate/racing callback a no-op', async () => {
    continuations.recordProviderSettlement.mockResolvedValue('duplicate');

    await expect(
      coordinator.completeProviderAction({
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        provider: 'replicate',
      }),
    ).resolves.toBe('duplicate');
    expect(nodeClaims.complete).not.toHaveBeenCalled();
    expect(executions.updateNodeResult).not.toHaveBeenCalled();
  });

  it('isolates a poison continuation and resumes later candidates', async () => {
    continuations.findReconciliationCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-poison',
        organizationId: 'org-1',
        provider: 'replicate',
        succeeded: true,
      },
      {
        continuationId: 'continuation-healthy',
        organizationId: 'org-1',
        provider: 'replicate',
        succeeded: true,
      },
    ]);
    continuations.claimProviderSettlement
      .mockRejectedValueOnce(new Error('poison row'))
      .mockResolvedValueOnce({
        actionId: 'imageGen',
        continuationId: 'continuation-healthy',
        creditsUsed: 5,
        executionId: 'execution-healthy',
        finalOutput: { id: 'ingredient-healthy', status: 'GENERATED' },
        ingredientId: 'ingredient-healthy',
        kind: 'claimed',
        nodeId: 'generate',
        organizationId: 'org-1',
        workflowVersionId: 'version-1',
      });

    await expect(coordinator.reconcileProviderContinuations()).resolves.toEqual(
      {
        failed: 0,
        pollsDispatched: 0,
        resumed: 1,
      },
    );
    expect(
      workflowExecutor.continueProviderCallbackExecution,
    ).toHaveBeenCalledWith({
      executionId: 'execution-healthy',
      organizationId: 'org-1',
      workflowVersionId: 'version-1',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to reconcile continuation'),
      expect.any(Error),
      {
        continuationId: 'continuation-poison',
        organizationId: 'org-1',
      },
    );
  });
});
