import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import { applyWorkflowOperationEvidence } from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type {
  WorkflowExecutionGenerationBilling,
  WorkflowGenerationProviderEvidence,
} from '@genfeedai/contracts/interfaces/billing';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
const now = new Date('2026-09-30T00:01:00.000Z');
function fixture(funding = workflowFundingFixture()) {
  const execution = {
    userId: funding.manifest.actorUserId,
    workflowVersionId: funding.manifest.workflowVersionId,
    status: WorkflowExecutionStatus.RUNNING,
    generationBilling: funding,
  };
  let isDeleted = true;
  let isPurged = false;
  const hold = {
    id: 'hold-execution-a',
    actorUserId: 'user-a',
    amount: 6,
    idempotencyKey: 'workflow-generation:execution-a',
    organizationId: 'org-a',
    workloadType: 'workflow-generation',
    workloadId: 'execution-a',
    status: CreditReservationStatus.RESERVED,
    metadata: { originalAudit: { keep: true }, workflowFunding: funding },
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    workflowExecution: {
      findFirst: vi.fn(async (input: { where: { isDeleted: boolean } }) =>
        !isPurged && input.where.isDeleted === isDeleted ? execution : null,
      ),
      updateMany: vi.fn(
        async (input: {
          where: { isDeleted: boolean };
          data: { generationBilling: WorkflowExecutionGenerationBilling };
        }) => {
          if (isPurged || input.where.isDeleted !== isDeleted)
            return { count: 0 };
          execution.generationBilling = input.data.generationBilling;
          return { count: 1 };
        },
      ),
    },
    creditReservation: {
      findFirst: vi.fn(async () => hold),
      updateMany: vi.fn(
        async (input: { data: { metadata: typeof hold.metadata } }) => {
          hold.metadata = input.data.metadata;
          return { count: 1 };
        },
      ),
    },
    $transaction: vi.fn(
      async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(prisma as unknown as Prisma.TransactionClient),
    ),
  };
  const credits = {
    findReservationForWorkload: vi.fn().mockResolvedValue(null),
    reserveCredits: vi.fn(async () => {
      isDeleted = true;
      return hold;
    }),
    releaseReservation: vi.fn(async () => {
      hold.status = CreditReservationStatus.RELEASED;
    }),
    settleReservation: vi.fn(async () => {
      hold.status = CreditReservationStatus.SETTLED;
    }),
  };
  const service = new WorkflowGenerationBillingService(
    prisma as unknown as PrismaService,
    credits as unknown as CreditsUtilsService,
    { warn: vi.fn() } as unknown as LoggerService,
  );
  return {
    service,
    prisma,
    credits,
    hold,
    execution,
    tx: prisma as unknown as Prisma.TransactionClient,
    setLive: () => {
      isDeleted = false;
    },
    setPurged: () => {
      isPurged = true;
    },
  };
}
function preparing(): WorkflowExecutionGenerationBilling {
  return {
    ...workflowFundingFixture(),
    state: 'preparing',
    reservationId: null,
  };
}
function submitted(): WorkflowExecutionGenerationBilling {
  let plan = workflowFundingFixture();
  const operationId = plan.manifest.allocations[0].operationId;
  plan = applyWorkflowOperationEvidence(
    plan,
    { operationId, phase: 'claimed', claimId: 'claim-a' },
    now,
  );
  return applyWorkflowOperationEvidence(
    plan,
    {
      operationId,
      phase: 'submission-intent',
      intentId: operationId,
      observedAt: now.toISOString(),
    },
    now,
  );
}

describe('WorkflowGenerationBillingService recovery', () => {
  it('reattaches a preparing hold after deletion and CAS-releases only unsubmitted work', async () => {
    const state = fixture(preparing());
    await state.service.reconcileReservation(state.hold.id, 'org-a', now);
    expect(state.hold.metadata.originalAudit).toEqual({ keep: true });
    expect(state.hold.metadata.workflowFunding).toMatchObject({
      state: 'funded',
      reservationId: state.hold.id,
      dispatchClosed: true,
    });
    expect(
      state.hold.metadata.workflowFunding.operations.every(
        (item) => item.phase === 'unsubmitted',
      ),
    ).toBe(true);
    expect(state.prisma.workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'execution-a', organizationId: 'org-a', isDeleted: true },
      }),
    );
    expect(state.credits.releaseReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        reservationId: state.hold.id,
        organizationId: 'org-a',
        expectedReservationMetadata: state.hold.metadata,
      }),
    );
  });
  it('recovers deletion between reserve commit and attachment instead of stranding its hold', async () => {
    const state = fixture(preparing());
    state.setLive();
    await expect(
      state.service.recoverPreparation('execution-a', 'org-a'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        detail: expect.stringContaining('unavailable'),
      }),
    });
    expect(state.credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ workflowExecutionId: 'execution-a' }),
    );
    expect(state.hold.status).toBe(CreditReservationStatus.RELEASED);
    expect(state.hold.metadata.workflowFunding.dispatchClosed).toBe(true);
  });
  it('retains deleted submitted work and settles an actual late completion from reservation proof', async () => {
    const state = fixture(submitted());
    await state.service.reconcileReservation(state.hold.id, 'org-a', now);
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
    expect(state.credits.settleReservation).not.toHaveBeenCalled();
    expect(state.hold.metadata.workflowFunding.operations[0].phase).toBe(
      'submission-intent',
    );
    const operationId =
      state.hold.metadata.workflowFunding.manifest.allocations[0].operationId;
    await state.service.recordOperationProof(state.tx, 'execution-a', 'org-a', {
      operationId,
      phase: 'completed',
      intentId: operationId,
      proofId: 'durable-callback',
      observedAt: '2026-10-02T00:00:00.000Z',
      artifacts: [
        {
          ingredientId: 'asset-a',
          assetKey: 'durable/video.mp4',
          role: 'primary',
        },
      ],
      completion: { completedOutputs: 1, successfulRequests: 1 },
    });
    await state.service.settleExecution('execution-a', 'org-a');
    expect(state.credits.settleReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actualAmount: 5,
        reservationId: state.hold.id,
        organizationId: 'org-a',
        metadata: expect.objectContaining({
          workflowOperations: [
            expect.objectContaining({ nodeId: 'video', credits: 5 }),
            expect.objectContaining({ nodeId: 'image', credits: 0 }),
          ],
        }),
      }),
    );
    expect(state.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'retains immutable financial evidence after hard purge (submitted=%s)',
    async (isSubmitted) => {
      const state = fixture(isSubmitted ? submitted() : preparing());
      state.setPurged();
      await state.service.reconcileReservation(state.hold.id, 'org-a', now);
      expect(state.prisma.workflowExecution.updateMany).not.toHaveBeenCalled();
      expect(state.hold.metadata.workflowFunding.dispatchClosed).toBe(true);
      expect(state.credits.releaseReservation).toHaveBeenCalledTimes(
        isSubmitted ? 0 : 1,
      );
    },
  );
  it.each(['claimed', 'submission-intent'] as const)(
    'cannot smuggle %s through callback proof to bypass claim fencing',
    async (phase) => {
      const state = fixture(submitted());
      const operationId =
        state.hold.metadata.workflowFunding.manifest.allocations[0].operationId;
      await expect(
        state.service.recordOperationProof(state.tx, 'execution-a', 'org-a', {
          operationId,
          phase,
          claimId: 'old-worker',
          intentId: operationId,
          observedAt: now.toISOString(),
        } as unknown as WorkflowGenerationProviderEvidence),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: expect.stringContaining('cannot authorize provider dispatch'),
        }),
      });
      expect(state.prisma.$queryRaw).not.toHaveBeenCalled();
      expect(state.prisma.creditReservation.updateMany).not.toHaveBeenCalled();
    },
  );
});
