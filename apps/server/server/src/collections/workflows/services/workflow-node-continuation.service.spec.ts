import { WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
import { WorkflowNodeContinuationService } from '@server/collections/workflows/services/workflow-node-continuation.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseContinuation = {
  actionId: 'imageGen',
  completedAt: null,
  creditsUsed: 5,
  error: null,
  executionId: 'execution-1',
  externalId: 'provider-1',
  id: 'continuation-1',
  ingredientId: 'ingredient-1',
  initialOutput: null,
  nodeId: 'generate',
  organizationId: 'org-1',
  pollAttempt: null,
  pollDispatchClaimedAt: null,
  pollDispatchedAt: null,
  provider: 'replicate',
  providerResult: null,
  resumeClaimedAt: null,
  status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
  updatedAt: new Date('2026-08-29T10:00:00.000Z'),
  workflowVersionId: 'version-1',
};

describe('WorkflowNodeContinuationService', () => {
  const workflowNodeContinuation = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback(prisma),
    ),
    ingredient: { findFirst: vi.fn(), updateMany: vi.fn() },
    workflowExecution: { findFirst: vi.fn(), updateMany: vi.fn() },
    workflowExecutionNodeResult: { updateMany: vi.fn() },
    workflowNodeClaim: { updateMany: vi.fn() },
    workflowNodeContinuation,
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const config = { get: vi.fn().mockReturnValue('https://api.example.com') };
  const pollQueue = { hasAttempt: vi.fn(), schedule: vi.fn() };
  let service: WorkflowNodeContinuationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowNodeContinuationService(
      prisma as never,
      logger as never,
      config as never,
      pollQueue as never,
    );
  });

  it('fails closed when an execution node already owns an ambiguous provider submission', async () => {
    prisma.workflowExecution.findFirst.mockResolvedValue({ id: 'execution-1' });
    prisma.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1' });
    workflowNodeContinuation.findUnique.mockResolvedValue({
      ...baseContinuation,
      externalId: null,
      status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    });

    await expect(
      service.createBeforeProviderSubmission({
        actionId: 'imageGen',
        executionId: 'execution-1',
        ingredientId: 'ingredient-1',
        nodeId: 'generate',
        organizationId: 'org-1',
        provider: 'replicate',
        workflowVersionId: 'version-1',
      }),
    ).rejects.toThrow('automatic resubmission is forbidden');
    expect(workflowNodeContinuation.create).not.toHaveBeenCalled();
  });

  it('refuses to suspend a callback action without a pre-submission continuation', async () => {
    workflowNodeContinuation.findFirst.mockResolvedValue(null);

    await expect(
      service.attachInitialOutput({
        actionId: 'imageGen',
        creditsUsed: 5,
        executionId: 'execution-1',
        initialOutput: {
          id: 'ingredient-1',
          model: 'flux',
          provider: 'replicate',
          status: 'PROCESSING',
        },
        nodeId: 'generate',
        organizationId: 'org-1',
        workflowVersionId: 'version-1',
      }),
    ).rejects.toThrow('did not create a durable continuation');
  });

  it('settles callback-before-output without corrupting nested status fields', async () => {
    workflowNodeContinuation.findFirst.mockResolvedValue({
      ...baseContinuation,
      externalId: null,
      providerResult: { externalId: 'provider-1' },
      status: WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
    });
    workflowNodeContinuation.update.mockResolvedValue(undefined);

    await expect(
      service.attachInitialOutput({
        actionId: 'imageGen',
        creditsUsed: 5,
        executionId: 'execution-1',
        initialOutput: {
          generationBriefEvidence: { status: 'provider-specific' },
          id: 'ingredient-1',
          model: 'flux',
          provider: 'replicate',
          status: 'PROCESSING',
        },
        nodeId: 'generate',
        organizationId: 'org-1',
        workflowVersionId: 'version-1',
      }),
    ).resolves.toMatchObject({
      finalOutput: {
        generationBriefEvidence: { status: 'provider-specific' },
        status: 'GENERATED',
      },
      kind: 'provider-settled',
      succeeded: true,
    });
  });

  it('does not let a tenant-mismatched callback claim another continuation', async () => {
    workflowNodeContinuation.findFirst.mockResolvedValue(null);

    await expect(
      service.recordProviderSettlement({
        identity: {
          continuationId: 'continuation-1',
          organizationId: 'org-other',
        },
        provider: 'replicate',
        succeeded: true,
      }),
    ).resolves.toBe('duplicate');
    expect(workflowNodeContinuation.updateMany).not.toHaveBeenCalled();
  });

  it('claims provider failure even when the submitting process never attached output', async () => {
    workflowNodeContinuation.findFirst.mockResolvedValue({
      ...baseContinuation,
      error: 'submission ownership expired',
      externalId: null,
      status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    });
    workflowNodeContinuation.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.claimProviderSettlement({
        error: 'submission ownership expired',
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        provider: 'replicate',
        succeeded: false,
      }),
    ).resolves.toMatchObject({
      error: 'submission ownership expired',
      kind: 'claimed',
      nodeId: 'generate',
    });
  });

  it('atomically fails continuation, media, node claim, node result, and execution when submission fails', async () => {
    workflowNodeContinuation.findFirst.mockResolvedValue({
      ...baseContinuation,
      externalId: null,
      status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    });
    workflowNodeContinuation.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
    prisma.workflowNodeClaim.updateMany.mockResolvedValue({ count: 1 });
    prisma.workflowExecutionNodeResult.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.workflowExecution.updateMany.mockResolvedValue({ count: 1 });

    await service.failProviderSubmission({
      continuationId: 'continuation-1',
      error: 'provider rejected submission',
      organizationId: 'org-1',
    });

    expect(workflowNodeContinuation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error: 'provider rejected submission',
          status: WorkflowNodeContinuationStatus.FAILED,
        }),
      }),
    );
    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      data: { status: 'FAILED' },
      where: {
        id: 'ingredient-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.workflowNodeClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          error: 'provider rejected submission',
          leaseExpiresAt: null,
          leaseOwnerId: null,
          status: 'failed',
        },
      }),
    );
    expect(prisma.workflowExecutionNodeResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(prisma.workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('isolates a poison HeyGen outbox row and dispatches later polls', async () => {
    workflowNodeContinuation.findMany.mockResolvedValue([
      {
        ...baseContinuation,
        externalId: 'heygen-poison',
        id: 'continuation-poison',
        pollAttempt: 1,
        provider: 'heygen',
      },
      {
        ...baseContinuation,
        externalId: 'heygen-healthy',
        id: 'continuation-healthy',
        pollAttempt: 1,
        provider: 'heygen',
      },
    ]);
    pollQueue.hasAttempt.mockResolvedValue(false);
    workflowNodeContinuation.updateMany.mockResolvedValue({ count: 1 });
    pollQueue.schedule
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce('heygen-poll-continuation-healthy-1');

    await expect(service.reconcileHeygenPollTransport()).resolves.toBe(1);
    expect(pollQueue.schedule).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to dispatch HeyGen poll continuation'),
      expect.any(Error),
      {
        continuationId: 'continuation-poison',
        organizationId: 'org-1',
        pollAttempt: 1,
      },
    );
  });
});
