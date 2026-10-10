import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
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
    model: { findFirst: vi.fn() },
    mediaVendorCost: { create: vi.fn() },
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

  it('records URL-only Fal acceptance before any file measurements', async () => {
    workflowNodeContinuation.findFirst.mockResolvedValue({ ...baseContinuation, provider: 'fal', externalId: null, status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION });
    await service.markProviderSubmitted({ continuationId: 'continuation-1', organizationId: 'org-1', externalId: 'https://fal.example/output.mp4' });
    expect(workflowNodeContinuation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: WorkflowNodeContinuationStatus.WAITING_PROVIDER, providerResult: { acceptedFalOutput: { externalId: 'https://fal.example/output.mp4' } } }) }));
  });

  it('records measurements only against the accepted tenant, ingredient and URL', async () => {
    const externalId = 'https://fal.example/output.mp4';
    workflowNodeContinuation.findFirst.mockResolvedValue({ ...baseContinuation, provider: 'fal', externalId, providerResult: { acceptedFalOutput: { externalId } } });
    workflowNodeContinuation.updateMany.mockResolvedValue({ count: 1 });
    const measurement = { width: 864, height: 496, duration: 6, framesPerSecond: 24, assetHash: 'a'.repeat(64), sizeBytes: 1000, assetKey: 'org-1/ingredient-1/video.mp4' };
    await service.recordFalOutputMeasurement({ continuationId: 'continuation-1', organizationId: 'org-1', ingredientId: 'ingredient-1', externalId, measurement });
    expect(workflowNodeContinuation.findFirst).toHaveBeenCalledWith({ where: { id: 'continuation-1', organizationId: 'org-1', ingredientId: 'ingredient-1', externalId, provider: 'fal', status: WorkflowNodeContinuationStatus.WAITING_PROVIDER } });
    expect(workflowNodeContinuation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', updatedAt: baseContinuation.updatedAt }), data: { providerResult: { acceptedFalOutput: { externalId }, measuredFalOutput: { externalId, measurement } } } }));
  });

  it.each(['missing-continuation', 'different-accepted-url', 'provider-disagreement', 'changed-measurement', 'lost-claim'])('retains accepted work when measurement is rejected: %s', async (kind) => {
    const externalId = 'https://fal.example/output.mp4';
    const measurement = { width: 864, height: 496, duration: 6, framesPerSecond: 24, assetHash: 'a'.repeat(64), sizeBytes: 1000, assetKey: 'org-1/ingredient-1/video.mp4' };
    workflowNodeContinuation.findFirst.mockResolvedValue(kind === 'missing-continuation' ? null : {
      ...baseContinuation, provider: 'fal', externalId,
      providerResult: {
        acceptedFalOutput: { externalId: kind === 'different-accepted-url' ? 'different-url' : externalId, ...(kind === 'provider-disagreement' ? { completionQuantities: { duration: 8 } } : {}) },
        ...(kind === 'changed-measurement' ? { measuredFalOutput: { externalId, measurement: { ...measurement, assetHash: 'b'.repeat(64) } } } : {}),
      },
    });
    workflowNodeContinuation.updateMany.mockResolvedValue({ count: kind === 'lost-claim' ? 0 : 1 });
    await expect(service.recordFalOutputMeasurement({ continuationId: 'continuation-1', organizationId: 'org-1', ingredientId: 'ingredient-1', externalId, measurement })).rejects.toThrow();
    if (kind !== 'lost-claim') expect(workflowNodeContinuation.updateMany).not.toHaveBeenCalled();
    expect(workflowNodeContinuation.create).not.toHaveBeenCalled();
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

  it('fails submission resources while leaving execution finalization to the workflow owner', async () => {
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
    expect(prisma.workflowExecution.updateMany).not.toHaveBeenCalled();
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
  it('persists a pinned pending provider intent in the continuation transaction', async () => {
    prisma.workflowExecution.findFirst.mockResolvedValue({ id: 'execution-1' });
    prisma.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1' });
    workflowNodeContinuation.findUnique.mockResolvedValue(null);
    workflowNodeContinuation.create.mockResolvedValue({
      ...baseContinuation,
      status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    });
    prisma.model.findFirst.mockResolvedValue({
      providerCostUsd: 0.12,
      pricingType: 'per-second',
      updatedAt: new Date('2026-09-05T00:00:00Z'),
    });
    await service.createBeforeProviderSubmission({
      actionId: 'imageGen',
      executionId: 'execution-1',
      ingredientId: 'ingredient-1',
      nodeId: 'generate',
      organizationId: 'org-1',
      provider: 'replicate',
      workflowVersionId: 'version-1',
      model: 'model',
    });
    expect(prisma.mediaVendorCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowExecutionId: 'execution-1',
        workflowNodeId: 'generate',
        costEvidence: 'pending',
        pricingSnapshot: {
          isByok: false,
          billingDisposition: 'not_charged',
          providerCostUsd: 0.12,
          pricingType: 'per-second',
          modelUpdatedAt: '2026-09-05T00:00:00.000Z',
        },
      }),
    });
    prisma.mediaVendorCost.create.mockRejectedValueOnce(
      new Error('ledger unavailable'),
    );
    await expect(
      service.createBeforeProviderSubmission({
        actionId: 'imageGen',
        executionId: 'execution-1',
        ingredientId: 'ingredient-1',
        nodeId: 'generate',
        organizationId: 'org-1',
        provider: 'replicate',
        workflowVersionId: 'version-1',
        model: 'model',
      }),
    ).rejects.toThrow('ledger unavailable');
  });

  it('records the BYOK credential reference on the continuation it creates', async () => {
    prisma.workflowExecution.findFirst.mockResolvedValue({ id: 'execution-1' });
    prisma.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1' });
    workflowNodeContinuation.findUnique.mockResolvedValue(null);
    workflowNodeContinuation.create.mockResolvedValue({
      ...baseContinuation,
      status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    });
    prisma.model.findFirst.mockResolvedValue(null);

    await service.createBeforeProviderSubmission({
      actionId: 'videoGen',
      executionId: 'execution-1',
      ingredientId: 'ingredient-1',
      isByok: true,
      model: 'model',
      nodeId: 'generate',
      organizationId: 'org-1',
      provider: 'replicate',
      workflowVersionId: 'version-1',
    });

    expect(workflowNodeContinuation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isByok: true }),
    });
  });

  it('returns the BYOK credential reference with each Replicate poll candidate', async () => {
    workflowNodeContinuation.findMany.mockResolvedValue([
      {
        externalId: 'prediction-1',
        id: 'continuation-1',
        ingredientId: 'ingredient-1',
        isByok: true,
        organizationId: 'org-1',
      },
    ]);

    await expect(service.findReplicatePollCandidates()).resolves.toEqual([
      {
        continuationId: 'continuation-1',
        externalId: 'prediction-1',
        ingredientId: 'ingredient-1',
        isByok: true,
        organizationId: 'org-1',
      },
    ]);
    expect(workflowNodeContinuation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ isByok: true }),
      }),
    );
  });
  it('does not fabricate provider failure from an expired unacknowledged submission intent', async () => {
    workflowNodeContinuation.findMany.mockResolvedValue([
      {
        ...baseContinuation,
        externalId: null,
        status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
        updatedAt: new Date(0),
      },
    ]);
    await expect(service.findReconciliationCandidates()).resolves.toEqual([]);
    expect(workflowNodeContinuation.updateMany).not.toHaveBeenCalled();
    const query = JSON.stringify(
      workflowNodeContinuation.findMany.mock.calls[0][0],
    );
    expect(query).not.toContain(
      WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    );
  });
});
