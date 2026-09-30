import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  assertWorkflowExecutionAdmission,
  lockWorkflowExecutionFunding,
} from '@api/helpers/utils/credits/workflow-execution-admission.util';
import {
  workflowExecutionGenerationBillingSchema as fundingSchema,
  workflowGenerationManifestSchema as manifestSchema,
} from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import {
  applyWorkflowOperationEvidence,
  assertWorkflowFundingIdentity,
  closeWorkflowDispatch,
  parseWorkflowGenerationProviderEvidence,
  workflowGenerationOperationId,
} from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { lockWorkflowFundingRecoveryExecution } from '@api/helpers/utils/credits/workflow-generation-recovery.util';
import {
  calculateWorkflowGenerationSettlement,
  workflowGenerationHoldAmount,
} from '@api/helpers/utils/credits/workflow-generation-settlement.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import {
  MEDIA_GENERATION_HOLD_TTL_MS,
  WORKFLOW_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type {
  WorkflowExecutionGenerationBilling,
  WorkflowGenerationManifest,
  WorkflowGenerationProviderEvidence,
} from '@genfeedai/contracts/interfaces/billing';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class WorkflowGenerationBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  async prepareFunding(
    input: WorkflowGenerationManifest,
  ): Promise<WorkflowExecutionGenerationBilling> {
    const manifest = manifestSchema.parse(input);
    const plan = await this.serializable(async (tx) => {
      const existing = await lockWorkflowExecutionFunding(
        tx,
        manifest.executionId,
        manifest.organizationId,
      );
      if (existing) {
        if (existing.manifestHash !== quoteSnapshotHash(manifest))
          throw new BusinessLogicException(
            'Workflow retry cannot replace its frozen funding manifest',
          );
        return existing;
      }
      const execution = await tx.workflowExecution.findFirst({
        where: {
          id: manifest.executionId,
          organizationId: manifest.organizationId,
          isDeleted: false,
        },
        select: { userId: true, workflowVersionId: true, status: true },
      });
      if (
        !execution ||
        execution.userId !== manifest.actorUserId ||
        execution.workflowVersionId !== manifest.workflowVersionId ||
        (execution.status !== WorkflowExecutionStatus.PENDING &&
          execution.status !== WorkflowExecutionStatus.RUNNING)
      )
        throw new BusinessLogicException(
          'Workflow funding execution identity is unavailable',
        );
      const frozen = fundingSchema.parse({
        version: 1,
        state: 'preparing',
        manifest,
        manifestHash: quoteSnapshotHash(manifest),
        holdAmount: manifest.allocations
          .reduce(
            (amount, allocation) =>
              amount.plus(
                allocation.billingMode === 'credits'
                  ? (allocation.quote?.credits ?? 0)
                  : 0,
              ),
            new Prisma.Decimal(0),
          )
          .toString(),
        reservationId: null,
        expiresAt: new Date(
          Date.now() + MEDIA_GENERATION_HOLD_TTL_MS,
        ).toISOString(),
        dispatchClosed: false,
        operations: manifest.allocations.map((allocation) => ({
          operationId: allocation.operationId,
          phase: 'unclaimed',
        })),
      });
      assertWorkflowFundingIdentity(frozen);
      await this.persist(tx, frozen);
      return frozen;
    });
    return this.fundPreparedPlan(plan);
  }

  /** Retry preparation from its original manifest without repricing. */
  async recoverPreparation(
    executionId: string,
    organizationId: string,
  ): Promise<WorkflowExecutionGenerationBilling> {
    const plan = await this.serializable((tx) =>
      lockWorkflowExecutionFunding(tx, executionId, organizationId),
    );
    if (!plan)
      throw new BusinessLogicException('Workflow funding intent is missing');
    return this.fundPreparedPlan(plan);
  }

  private async fundPreparedPlan(
    plan: WorkflowExecutionGenerationBilling,
  ): Promise<WorkflowExecutionGenerationBilling> {
    if (plan.state === 'funded' && plan.reservationId) return plan;
    const { executionId, organizationId, actorUserId } = plan.manifest;
    const amount = workflowGenerationHoldAmount(plan);
    // A closure may race reserve(). Its hold is reattached and reconciled, never orphaned or admitted.
    const canCreateHold =
      !plan.dispatchClosed && new Date(plan.expiresAt) > new Date();
    const existingHold = amount.greaterThan(0)
      ? await this.credits.findReservationForWorkload({
          organizationId,
          workloadId: executionId,
          workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
        })
      : null;
    const reservation =
      existingHold ??
      (amount.greaterThan(0) && canCreateHold
        ? await this.credits.reserveCredits({
            actorUserId,
            amount: amount.toNumber(),
            organizationId,
            description: 'Workflow execution media funding',
            source: ActivitySource.SCRIPT,
            expiresAt: new Date(plan.expiresAt),
            idempotencyKey: `workflow-generation:${executionId}`,
            workloadId: executionId,
            workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
            workflowExecutionId: executionId,
            metadata: { workflowFunding: plan },
          })
        : null);
    if (
      reservation &&
      (!new Prisma.Decimal(reservation.amount).equals(amount) ||
        reservation.status !== CreditReservationStatus.RESERVED ||
        reservation.idempotencyKey !== `workflow-generation:${executionId}` ||
        reservation.actorUserId !== actorUserId ||
        reservation.workloadId !== executionId ||
        reservation.workloadType !== WORKFLOW_GENERATION_WORKLOAD_TYPE ||
        fundingSchema.parse(reservation.metadata?.workflowFunding)
          .manifestHash !== plan.manifestHash)
    )
      throw new BusinessLogicException(
        'Workflow hold differs from its immutable funding intent',
      );
    const funded = await this.serializable(async (tx) => {
      const current = await lockWorkflowExecutionFunding(
        tx,
        executionId,
        organizationId,
      );
      if (!current || current.manifestHash !== plan.manifestHash)
        throw new BusinessLogicException(
          'Workflow funding intent changed before hold attachment',
        );
      if (current.state === 'funded' && current.reservationId) {
        if (current.reservationId !== reservation?.id)
          throw new BusinessLogicException(
            'Workflow execution already owns a different reservation',
          );
        return current;
      }
      const execution = await tx.workflowExecution.findFirst({
        where: { id: executionId, organizationId, isDeleted: false },
        select: { status: true },
      });
      const expiredOrRetired =
        !execution ||
        (execution.status !== WorkflowExecutionStatus.PENDING &&
          execution.status !== WorkflowExecutionStatus.RUNNING) ||
        new Date(current.expiresAt) <= new Date();
      const attached = {
        ...current,
        state: 'funded' as const,
        reservationId: reservation?.id ?? null,
      };
      const updated = expiredOrRetired
        ? closeWorkflowDispatch(attached)
        : attached;
      await this.persist(tx, updated);
      return updated;
    }).catch(async (error: unknown) => {
      if (reservation)
        await this.reconcileReservation(reservation.id, organizationId);
      throw error;
    });
    if (funded.dispatchClosed)
      await this.settleExecution(executionId, organizationId);
    return funded;
  }

  /** Legacy and hidden-mirror runs have no source or funding and stay unfenced. */
  async admitClaimedNode(
    tx: Prisma.TransactionClient,
    executionId: string,
    organizationId: string,
    nodeId: string,
    claimId: string,
  ): Promise<void> {
    const execution = await tx.workflowExecution.findFirst({
      select: {
        generationAdmissionSource: true,
        generationBilling: true,
      },
      where: { id: executionId, isDeleted: false, organizationId },
    });
    if (!execution)
      throw new BusinessLogicException('Workflow execution is unavailable');
    if (!execution.generationAdmissionSource && !execution.generationBilling)
      return;
    await this.admitNode(tx, executionId, organizationId, nodeId, claimId);
  }

  /** Same transaction as initial/reclaimed durable claims, for every side-effect node. */
  async admitNode(
    tx: Prisma.TransactionClient,
    executionId: string,
    organizationId: string,
    nodeId: string,
    claimId: string,
  ): Promise<void> {
    const plan = await assertWorkflowExecutionAdmission(
      tx,
      executionId,
      organizationId,
    );
    if (!plan.manifest.selectedNodeIds.includes(nodeId))
      throw new BusinessLogicException(
        'Workflow node is outside the funded graph',
      );
    const allocation = plan.manifest.allocations.find(
      (item) => item.nodeId === nodeId,
    );
    if (!allocation) return;
    const updated = applyWorkflowOperationEvidence(plan, {
      operationId: allocation.operationId,
      phase: 'claimed',
      claimId,
    });
    if (updated !== plan) await this.persist(tx, updated);
  }

  /** Same transaction as continuation/local-job intent, immediately before provider dispatch. */
  async recordSubmissionIntent(
    tx: Prisma.TransactionClient,
    executionId: string,
    organizationId: string,
    operationId: string,
    dispatchFingerprint: string,
    claimId: string,
  ): Promise<void> {
    const plan = await assertWorkflowExecutionAdmission(
      tx,
      executionId,
      organizationId,
    );
    const allocation = plan.manifest.allocations.find(
      (item) => item.operationId === operationId,
    );
    if (
      !allocation ||
      allocation.dispatch.billableFingerprint !== dispatchFingerprint
    )
      throw new BusinessLogicException(
        'Workflow dispatch differs from its funded provider plan',
      );
    const current = plan.operations.find(
      (item) => item.operationId === operationId,
    );
    if (current?.phase !== 'claimed' || current.claimId !== claimId)
      throw new BusinessLogicException(
        'Workflow operation already has provider intent',
      );
    await this.persist(
      tx,
      applyWorkflowOperationEvidence(plan, {
        operationId,
        phase: 'submission-intent',
        intentId: operationId,
        observedAt: new Date().toISOString(),
      }),
    );
  }

  async recordContinuationProof(
    tx: Prisma.TransactionClient,
    continuation: {
      actionId: string;
      executionId: string;
      ingredientId: string;
      nodeId: string;
      organizationId: string;
      provider: string;
    },
    evidence:
      | {
          kind: 'accepted';
          providerJobId: string;
        }
      | { kind: 'submission-rejected' }
      | {
          kind: 'provider-terminal' | 'local-job-terminal';
          providerJobId?: string;
        }
      | {
          kind: 'completed';
          providerJobId?: string;
        },
  ): Promise<void> {
    const plan = await lockWorkflowExecutionFunding(
      tx,
      continuation.executionId,
      continuation.organizationId,
    );
    if (!plan) return;
    const operationId = workflowGenerationOperationId(
      continuation.executionId,
      continuation.nodeId,
      continuation.actionId,
    );
    const allocation = plan.manifest.allocations.find(
      (item) => item.operationId === operationId,
    );
    if (!allocation) return;
    const observedAt = new Date().toISOString();
    if (evidence.kind === 'accepted') {
      await this.recordOperationProof(
        tx,
        continuation.executionId,
        continuation.organizationId,
        {
          intentId: operationId,
          observedAt,
          operationId,
          phase: 'accepted',
          providerJobId: evidence.providerJobId,
        },
      );
      return;
    }
    if (evidence.kind === 'completed') {
      await this.recordOperationProof(
        tx,
        continuation.executionId,
        continuation.organizationId,
        {
          artifacts: [
            {
              assetKey: `workflow-generation/${continuation.ingredientId}`,
              ingredientId: continuation.ingredientId,
              role: 'primary',
            },
          ],
          completion: {
            ...allocation.dispatch.quantities,
            completedOutputs: 1,
            successfulRequests: 1,
          },
          intentId: operationId,
          observedAt,
          operationId,
          phase: 'completed',
          proofId: continuation.ingredientId,
          ...(evidence.providerJobId
            ? { providerJobId: evidence.providerJobId }
            : {}),
        },
      );
      return;
    }
    await this.recordOperationProof(
      tx,
      continuation.executionId,
      continuation.organizationId,
      {
        intentId: operationId,
        kind:
          evidence.kind === 'submission-rejected'
            ? 'submission-rejected'
            : evidence.kind,
        observedAt,
        operationId,
        phase: 'failed',
        provider: continuation.provider,
        proofId: continuation.ingredientId,
        ...(evidence.kind !== 'submission-rejected' && evidence.providerJobId
          ? { providerJobId: evidence.providerJobId }
          : {}),
      },
    );
  }

  /** Callback proof remains recoverable after execution deletion; dispatch admission stays live-only. */
  async recordOperationProof(
    tx: Prisma.TransactionClient,
    executionId: string,
    organizationId: string,
    evidence: WorkflowGenerationProviderEvidence,
  ): Promise<void> {
    const incoming = parseWorkflowGenerationProviderEvidence(evidence);
    const execution = await lockWorkflowFundingRecoveryExecution(
      tx,
      executionId,
      organizationId,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "organizationId" = ${organizationId} AND "workloadId" = ${executionId} AND "workloadType" = ${WORKFLOW_GENERATION_WORKLOAD_TYPE} AND "isDeleted" = false FOR UPDATE`,
    );
    const hold = await tx.creditReservation.findFirst({
      where: {
        organizationId,
        isDeleted: false,
        workloadId: executionId,
        workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
      },
    });
    const plan = hold
      ? fundingSchema.parse(
          z.record(z.string(), z.unknown()).parse(hold.metadata)
            .workflowFunding,
        )
      : execution?.funding;
    if (!plan)
      throw new BusinessLogicException(
        'Workflow financial proof has no funding owner',
      );
    assertWorkflowFundingIdentity(plan);
    if (
      plan.manifest.executionId !== executionId ||
      plan.manifest.organizationId !== organizationId ||
      (hold &&
        (plan.reservationId !== hold.id ||
          plan.manifest.actorUserId !== hold.actorUserId)) ||
      (execution?.funding &&
        execution.funding.manifestHash !== plan.manifestHash)
    )
      throw new BusinessLogicException(
        'Workflow callback funding owner changed',
      );
    const updated = applyWorkflowOperationEvidence(plan, incoming);
    if (updated !== plan)
      await this.persist(tx, updated, execution ? execution.isDeleted : null);
  }

  async closeInTransaction(
    tx: Prisma.TransactionClient,
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    const plan = await lockWorkflowExecutionFunding(
      tx,
      executionId,
      organizationId,
    );
    if (!plan) return;
    const updated = closeWorkflowDispatch(plan);
    if (updated !== plan) await this.persist(tx, updated);
  }

  async closeExecution(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    await this.serializable((tx) =>
      this.closeInTransaction(tx, executionId, organizationId),
    );
    await this.settleExecution(executionId, organizationId);
  }

  /** Reattaches preparing/orphan holds and closes tombstones without inventing provider failure. */
  async reconcileReservation(
    reservationId: string,
    organizationId: string,
    now = new Date(),
  ): Promise<void> {
    const observed = await this.prisma.creditReservation.findFirst({
      where: {
        id: reservationId,
        organizationId,
        isDeleted: false,
        workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
      },
    });
    if (!observed) return;
    const observedMetadata = z
      .record(z.string(), z.unknown())
      .parse(observed.metadata);
    const observedPlan = fundingSchema.parse(observedMetadata.workflowFunding);
    const executionId = observedPlan.manifest.executionId;
    await this.serializable(async (tx) => {
      const execution = await lockWorkflowFundingRecoveryExecution(
        tx,
        executionId,
        organizationId,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "id" = ${reservationId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
      const hold = await tx.creditReservation.findFirst({
        where: {
          id: reservationId,
          organizationId,
          isDeleted: false,
          workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
          workloadId: executionId,
        },
      });
      if (!hold || hold.status !== CreditReservationStatus.RESERVED) return;
      const metadata = z.record(z.string(), z.unknown()).parse(hold.metadata);
      const financial = fundingSchema.parse(metadata.workflowFunding);
      assertWorkflowFundingIdentity(financial);
      if (
        financial.manifest.organizationId !== organizationId ||
        financial.manifest.executionId !== executionId ||
        financial.manifest.actorUserId !== hold.actorUserId ||
        financial.manifestHash !== observedPlan.manifestHash ||
        !new Prisma.Decimal(hold.amount).equals(financial.holdAmount) ||
        (financial.reservationId !== null &&
          financial.reservationId !== hold.id) ||
        hold.idempotencyKey !== `workflow-generation:${executionId}`
      )
        throw new BusinessLogicException(
          'Workflow orphan hold identity is inconsistent',
        );
      if (
        execution &&
        (execution.actorUserId !== financial.manifest.actorUserId ||
          execution.workflowVersionId !==
            financial.manifest.workflowVersionId ||
          (execution.funding &&
            execution.funding.manifestHash !== financial.manifestHash))
      )
        throw new BusinessLogicException(
          'Workflow recovery execution differs from its immutable hold',
        );
      if (
        execution?.funding?.reservationId &&
        execution.funding.reservationId !== hold.id
      )
        throw new BusinessLogicException(
          'Workflow recovery execution owns another reservation',
        );
      // Before attachment only mutex-protected closure can advance the execution.
      // Once funded, the reservation is the authoritative financial evidence.
      const authority =
        financial.state === 'preparing'
          ? (execution?.funding ?? financial)
          : financial;
      const attached: WorkflowExecutionGenerationBilling = {
        ...authority,
        state: 'funded',
        reservationId: hold.id,
      };
      const isRetired =
        !execution ||
        execution.isDeleted ||
        (execution.status !== WorkflowExecutionStatus.PENDING &&
          execution.status !== WorkflowExecutionStatus.RUNNING) ||
        new Date(attached.expiresAt) <= now;
      const recovered = isRetired
        ? closeWorkflowDispatch(attached, now)
        : attached;
      await this.persist(tx, recovered, execution ? execution.isDeleted : null);
    });
    await this.settleExecution(executionId, organizationId);
  }

  async settleExecution(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.settleSnapshot(executionId, organizationId);
        return;
      } catch (error: unknown) {
        if (
          attempt >= 2 ||
          !(error instanceof ReservationEvidenceChangedException)
        )
          throw error;
      }
    }
  }

  private async settleSnapshot(
    executionId: string,
    organizationId: string,
  ): Promise<void> {
    // Library/execution tombstones cannot erase the financial reservation's proof.
    const hold = await this.prisma.creditReservation.findFirst({
      where: {
        organizationId,
        isDeleted: false,
        workloadId: executionId,
        workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
      },
    });
    if (!hold) return;
    const metadata = z.record(z.string(), z.unknown()).parse(hold.metadata);
    const plan = fundingSchema.parse(metadata.workflowFunding);
    assertWorkflowFundingIdentity(plan);
    if (plan.state === 'preparing' && plan.reservationId === null) return;
    if (
      plan.reservationId !== hold.id ||
      plan.manifest.organizationId !== organizationId ||
      plan.manifest.executionId !== executionId ||
      plan.manifest.actorUserId !== hold.actorUserId ||
      hold.idempotencyKey !== `workflow-generation:${executionId}` ||
      !new Prisma.Decimal(hold.amount).equals(plan.holdAmount)
    )
      throw new BusinessLogicException(
        'Workflow ledger evidence differs from its execution owner',
      );
    if (hold.status !== CreditReservationStatus.RESERVED) return;
    const settlement = calculateWorkflowGenerationSettlement(plan);
    if (!settlement) return;
    if (settlement.actualAmount === 0)
      await this.credits.releaseReservation({
        reservationId: hold.id,
        organizationId,
        expectedReservationMetadata: metadata,
      });
    else
      await this.credits.settleReservation({
        reservationId: hold.id,
        organizationId,
        actorUserId: plan.manifest.actorUserId,
        actualAmount: settlement.actualAmount,
        description: 'Completed workflow media operations',
        source: ActivitySource.SCRIPT,
        expectedReservationMetadata: metadata,
        metadata: {
          workflowExecutionId: executionId,
          workflowManifestHash: plan.manifestHash,
          workflowOperations: settlement.operations,
        },
      });
  }

  private async persist(
    tx: Prisma.TransactionClient,
    plan: WorkflowExecutionGenerationBilling,
    executionIsDeleted: boolean | null = false,
  ): Promise<void> {
    assertWorkflowFundingIdentity(plan);
    const { executionId, organizationId } = plan.manifest;
    if (plan.reservationId) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "id" = ${plan.reservationId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
      const hold = await tx.creditReservation.findFirst({
        where: {
          id: plan.reservationId,
          organizationId,
          isDeleted: false,
          workloadId: executionId,
          workloadType: WORKFLOW_GENERATION_WORKLOAD_TYPE,
        },
      });
      if (
        !hold ||
        hold.status !== CreditReservationStatus.RESERVED ||
        hold.actorUserId !== plan.manifest.actorUserId ||
        !new Prisma.Decimal(hold.amount).equals(plan.holdAmount)
      )
        throw new BusinessLogicException(
          'Workflow financial hold is unavailable',
        );
      const metadata = z.record(z.string(), z.unknown()).parse(hold.metadata);
      if (
        fundingSchema.parse(metadata.workflowFunding).manifestHash !==
        plan.manifestHash
      )
        throw new BusinessLogicException(
          'Workflow reservation manifest changed',
        );
      const saved = await tx.creditReservation.updateMany({
        where: {
          id: hold.id,
          organizationId,
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          metadata: { equals: toPrismaJson(metadata) },
        },
        data: {
          metadata: toPrismaJson({ ...metadata, workflowFunding: plan }),
        },
      });
      if (saved.count !== 1) throw new ReservationEvidenceChangedException();
    }
    if (executionIsDeleted === null) return;
    const saved = await tx.workflowExecution.updateMany({
      where: { id: executionId, organizationId, isDeleted: executionIsDeleted },
      data: { generationBilling: toPrismaJson(plan) },
    });
    if (saved.count !== 1)
      throw new BusinessLogicException(
        'Workflow execution funding write failed',
      );
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error: unknown) {
        if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
        this.logger.warn('Retrying workflow funding transaction conflict');
      }
    }
  }
}
