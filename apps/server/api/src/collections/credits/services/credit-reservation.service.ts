import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import {
  admitStrategyBudgetReservation,
  strategyBudgetMetadata,
} from '@api/collections/credits/services/strategy-budget-attribution.context';
import {
  validatedWorkflowAccountingAttribution,
  validatedWorkflowFundingAttribution,
} from '@api/collections/workflow-executions/services/workflow-accounting.context';
import {
  BusinessLogicException,
  UnsettleableReservationException,
} from '@api/exceptions/business-logic.exception';
import { crunReservationCompletion } from '@api/helpers/utils/credits/generation-quote-group.schema';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  CreditTransactionCategory,
  LiveSessionStatus,
  LiveSessionTerminateReason,
  parseCreditReservationStatus,
} from '@genfeedai/contracts';
import {
  LIVE_SESSION_WORKLOAD_TYPE,
  MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
  MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
  MEDIA_GENERATION_WORKLOAD_TYPE,
  WORKFLOW_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type {
  IBindCreditReservationOutputInput,
  ICreditReservation,
  ICreditWalletSnapshot,
  IReleaseCreditReservationInput,
  IReserveCreditsInput,
  ISettleCreditReservationInput,
} from '@genfeedai/contracts/interfaces/billing';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const DEFAULT_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SERIALIZATION_RETRIES = 3;
const BIND_ROUNDING_TOLERANCE = 1e-6;
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

type ReserveCreditsInput = IReserveCreditsInput & {
  billingAccountId: string;
};
export type CreditReservationAdmission = (
  tx: PrismaTransactionClient,
) => Promise<void>;

@Injectable()
export class CreditReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly transactionUtil: TransactionUtil,
  ) {}

  async reserve(
    input: ReserveCreditsInput,
    admission?: CreditReservationAdmission,
  ): Promise<ICreditReservation> {
    if (!Number.isFinite(input.amount) || !(input.amount > 0)) {
      throw new BusinessLogicException('Reservation amount must be positive');
    }

    try {
      return await this.runSerializable(async (tx) => {
        const existing = await tx.creditReservation.findFirst({
          where: {
            idempotencyKey: input.idempotencyKey,
            isDeleted: false,
            organizationId: input.organizationId,
          },
        });
        if (existing) {
          return this.toReservation(existing);
        }

        // Same serializable transaction as the wallet hold. A failed admission commits neither.
        if (admission) await admission(tx);
        await admitStrategyBudgetReservation(tx, input);
        const metadata = strategyBudgetMetadata(
          input.organizationId,
          input.metadata,
        );

        await this.creditBalanceService.applyDelta(
          input.organizationId,
          {
            billingAccountId: input.billingAccountId,
            heldDelta: input.amount,
          },
          tx,
        );

        const created = await tx.creditReservation.create({
          data: {
            ...(input.workflowExecutionId !== undefined
              ? await validatedWorkflowFundingAttribution(
                  tx,
                  input.organizationId,
                  input.workflowExecutionId,
                )
              : await validatedWorkflowAccountingAttribution(
                  tx,
                  input.organizationId,
                )),
            actorUserId: input.actorUserId,
            amount: input.amount,
            billingAccountId: input.billingAccountId,
            ...(input.brandId ? { brandId: input.brandId } : {}),
            expiresAt:
              input.expiresAt ??
              new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS),
            description: input.description,
            idempotencyKey: input.idempotencyKey,
            ...(Object.keys(metadata).length > 0
              ? { metadata: toPrismaJson(metadata) }
              : {}),
            organizationId: input.organizationId,
            source: input.source,
            status: CreditReservationStatus.RESERVED,
            workloadId: input.workloadId,
            workloadType: input.workloadType,
          },
        });
        return this.toReservation(created);
      });
    } catch (error: unknown) {
      if (this.errorCode(error) === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        const existing = await this.prisma.creditReservation.findFirst({
          where: {
            idempotencyKey: input.idempotencyKey,
            isDeleted: false,
            organizationId: input.organizationId,
          },
        });
        if (existing) return this.toReservation(existing);
      }
      throw error;
    }
  }

  /**
   * Moves `amount` credits out of a request-level hold into a new hold that
   * pays for exactly one output (#5657). The wallet's held total is unchanged:
   * the pool shrinks by what the output's hold gains, in one transaction, so a
   * concurrent admission never sees the credits as free. The pool keeps
   * whatever no output claimed, for the request to release.
   */
  async bindOutput(
    input: IBindCreditReservationOutputInput,
  ): Promise<ICreditReservation> {
    if (!Number.isFinite(input.amount) || !(input.amount > 0)) {
      throw new BusinessLogicException('Bound output amount must be positive');
    }
    const idempotencyKey = `${MEDIA_GENERATION_WORKLOAD_TYPE}:${input.workloadId}`;

    try {
      return await this.runSerializable(async (tx) => {
        const existing = await tx.creditReservation.findFirst({
          where: {
            idempotencyKey,
            isDeleted: false,
            organizationId: input.organizationId,
          },
        });
        if (existing) {
          return this.toReservation(existing);
        }

        const pool = await this.findReservation(input, tx);
        if (pool.status !== CreditReservationStatus.RESERVED) {
          throw new UnsettleableReservationException(pool.status);
        }
        if (input.amount > pool.amount + BIND_ROUNDING_TOLERANCE) {
          throw new BusinessLogicException(
            'Bound output amount exceeds the request hold',
            { amount: input.amount, poolAmount: pool.amount },
            'BIND_EXCEEDS_RESERVATION',
          );
        }

        // An even split can leave dust or overshoot the pool. A remainder
        // within tolerance moves onto this output so the wallet hold matches
        // the row amounts when the pool retires.
        const requested = Math.min(input.amount, pool.amount);
        const rawRemaining = pool.amount - requested;
        const retiresPool = rawRemaining <= BIND_ROUNDING_TOLERANCE;
        const amount = retiresPool ? pool.amount : requested;
        const remaining = retiresPool ? 0 : rawRemaining;
        const shrunk = await tx.creditReservation.updateMany({
          data: {
            amount: remaining,
            ...(remaining === 0
              ? { status: CreditReservationStatus.RELEASED }
              : {}),
          },
          where: {
            amount: pool.amount,
            id: pool.id,
            isDeleted: false,
            organizationId: pool.organizationId,
            status: CreditReservationStatus.RESERVED,
          },
        });
        if (shrunk.count !== 1) {
          throw new UnsettleableReservationException(pool.status);
        }

        const created = await tx.creditReservation.create({
          data: {
            ...(await validatedWorkflowAccountingAttribution(
              tx,
              pool.organizationId,
            )),
            actorUserId: pool.actorUserId,
            amount,
            billingAccountId: pool.billingAccountId,
            brandId: pool.brandId,
            description: pool.description,
            expiresAt: input.expiresAt,
            idempotencyKey,
            metadata: toPrismaJson(
              strategyBudgetMetadata(
                pool.organizationId,
                {
                  ...this.readMetadata(pool.metadata),
                  ...(input.metadata ?? {}),
                },
                pool,
              ),
            ),
            organizationId: pool.organizationId,
            source: pool.source,
            status: CreditReservationStatus.RESERVED,
            workloadId: input.workloadId,
            workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
          },
        });
        return this.toReservation(created);
      });
    } catch (error: unknown) {
      if (this.errorCode(error) === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        const existing = await this.prisma.creditReservation.findFirst({
          where: {
            idempotencyKey,
            isDeleted: false,
            organizationId: input.organizationId,
          },
        });
        if (existing) return this.toReservation(existing);
      }
      throw error;
    }
  }

  async findByWorkload(input: {
    organizationId: string;
    workloadId: string;
    workloadType: string;
  }): Promise<ICreditReservation | null> {
    const row = await this.prisma.creditReservation.findFirst({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(input.organizationId, {
        workloadId: input.workloadId,
        workloadType: input.workloadType,
      }),
    });
    return row ? this.toReservation(row) : null;
  }

  private async assertCrunSettlementAmount(
    tx: PrismaTransactionClient,
    reservation: Awaited<
      ReturnType<CreditReservationService['findReservation']>
    >,
    actualAmount: number,
  ): Promise<void> {
    const tasks = await tx.crunGenerationTask.findMany({
      where: {
        reservationId: reservation.id,
        organizationId: reservation.organizationId,
        isDeleted: false,
      },
    });
    const ingredients = tasks.length
      ? await tx.ingredient.findMany({
          where: {
            id: { in: tasks.map((task) => task.ingredientId) },
            organizationId: reservation.organizationId,
            isDeleted: false,
          },
          select: { id: true, s3Key: true },
        })
      : [];
    const completion = crunReservationCompletion(
      reservation,
      tasks,
      ingredients,
    );
    if (completion === null || completion === 0)
      throw new BusinessLogicException(
        'Crun settlement proof is incomplete',
        {},
        'CRUN_SETTLEMENT_NOT_READY',
      );
    if (completion !== undefined && completion !== actualAmount)
      throw new BusinessLogicException(
        'Settlement amount does not match frozen completion',
        {},
        'SETTLEMENT_AMOUNT_MISMATCH',
      );
  }

  async settle(
    input: ISettleCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.runSerializable((tx) => this.settleInTransaction(input, tx));
  }

  /** Caller owns the transaction; recovery is restricted by the media-hold service. */
  async settleInTransaction(
    input: ISettleCreditReservationInput,
    tx: PrismaTransactionClient,
    recoverEnded = false,
  ): Promise<ICreditWalletSnapshot> {
    if (!Number.isFinite(input.actualAmount) || input.actualAmount < 0) {
      throw new BusinessLogicException(
        'Settlement amount must be finite and non-negative',
      );
    }

    const reservation = await this.findReservation(input, tx);
    if (reservation.status === CreditReservationStatus.SETTLED) {
      if (reservation.settledAmount !== input.actualAmount) {
        throw new BusinessLogicException(
          'Settlement amount does not match the completed reservation',
          {
            actualAmount: input.actualAmount,
            settledAmount: reservation.settledAmount,
          },
          'SETTLEMENT_AMOUNT_MISMATCH',
        );
      }
      return this.walletSnapshot(reservation, tx);
    }

    if (
      reservation.status !== CreditReservationStatus.RESERVED &&
      !(
        recoverEnded &&
        (reservation.status === CreditReservationStatus.EXPIRED ||
          reservation.status === CreditReservationStatus.RELEASED)
      )
    ) {
      throw new UnsettleableReservationException(reservation.status);
    }

    if (input.actualAmount > reservation.amount) {
      throw new BusinessLogicException(
        'Settlement amount exceeds the reserved amount',
        {
          actualAmount: input.actualAmount,
          reservedAmount: reservation.amount,
        },
        'SETTLEMENT_EXCEEDS_RESERVATION',
      );
    }

    const previouslyCharged = recoverEnded
      ? await tx.creditTransaction.findFirst({
          where: {
            organizationId: reservation.organizationId,
            isDeleted: false,
            category: CreditTransactionCategory.DEDUCT,
            OR: [
              {
                referenceId: reservation.id,
                referenceType: 'credit_reservation',
              },
              ...(input.settlementIdempotencyKey
                ? [{ idempotencyKey: input.settlementIdempotencyKey }]
                : []),
            ],
          },
        })
      : null;
    if (previouslyCharged && previouslyCharged.amount !== input.actualAmount)
      throw new BusinessLogicException(
        'Existing charge does not match the reservation amount',
      );
    await this.assertCrunSettlementAmount(tx, reservation, input.actualAmount);
    const claimed = await tx.creditReservation.updateMany({
      data: {
        settledAmount: input.actualAmount,
        status: CreditReservationStatus.SETTLED,
      },
      where: scopedWhere(reservation.organizationId, {
        id: reservation.id,
        status: reservation.status,
        metadata: input.expectedReservationMetadata
          ? { equals: toPrismaJson(input.expectedReservationMetadata) }
          : undefined,
      }),
    });
    if (claimed.count !== 1) {
      const latest = await this.findReservation(input, tx);
      if (
        input.expectedReservationMetadata &&
        latest.status === CreditReservationStatus.RESERVED
      )
        throw new ReservationEvidenceChangedException();
      if (
        latest.status === CreditReservationStatus.SETTLED &&
        latest.settledAmount === input.actualAmount
      ) {
        return this.walletSnapshot(latest, tx);
      }
      throw new UnsettleableReservationException(latest.status);
    }

    const snapshot = await this.creditBalanceService.applyDelta(
      reservation.organizationId,
      {
        balanceDelta: previouslyCharged ? 0 : -input.actualAmount,
        billingAccountId: reservation.billingAccountId,
        heldDelta:
          reservation.status === CreditReservationStatus.RESERVED
            ? -reservation.amount
            : 0,
        maxOverdraftCredits: recoverEnded
          ? MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS
          : undefined,
      },
      tx,
      reservation.id,
    );

    await this.recordSettlement(
      tx,
      reservation,
      input,
      snapshot,
      !!previouslyCharged,
    );

    return snapshot;
  }

  private async recordSettlement(
    tx: PrismaTransactionClient,
    reservation: Awaited<
      ReturnType<CreditReservationService['findReservation']>
    >,
    input: ISettleCreditReservationInput,
    snapshot: ICreditWalletSnapshot,
    alreadyCharged: boolean,
  ): Promise<void> {
    const settleBrandId = reservation.brandId ?? input.brandId ?? null;
    if (!alreadyCharged)
      await this.creditTransactionsService.createTransactionEntry(
        reservation.organizationId,
        CreditTransactionCategory.DEDUCT,
        input.actualAmount,
        snapshot.settled + input.actualAmount,
        snapshot.settled,
        input.source ?? ActivitySource.SCRIPT,
        input.description,
        undefined,
        tx,
        {
          actorUserId: input.actorUserId,
          idempotencyKey: input.settlementIdempotencyKey,
          billingAccountId: reservation.billingAccountId,
          ...(settleBrandId ? { brandId: settleBrandId } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
          reservationId: reservation.id,
          referenceId: reservation.id,
          referenceType: 'credit_reservation',
        },
      );

    await tx.creditTransaction.updateMany({
      data: {
        actorUserId: input.actorUserId,
        billingAccountId: reservation.billingAccountId,
        ...(settleBrandId ? { brandId: settleBrandId } : {}),
        reservationId: reservation.id,
        ...(reservation.workflowExecutionId
          ? {
              workflowExecutionId: reservation.workflowExecutionId,
              workflowNodeId: reservation.workflowNodeId,
              workflowOperationId: reservation.workflowOperationId,
            }
          : {}),
      },
      where: {
        organizationId: reservation.organizationId,
        isDeleted: false,
        referenceId: reservation.id,
        referenceType: 'credit_reservation',
      },
    });
  }

  async release(
    input: IReleaseCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.runSerializable((tx) => this.releaseInTransaction(input, tx));
  }

  async releaseInTransaction(
    input: IReleaseCreditReservationInput,
    tx: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot> {
    const reservation = await this.findReservation(input, tx);
    if (reservation.status !== CreditReservationStatus.RESERVED) {
      return this.walletSnapshot(reservation, tx);
    }

    const tasks = await tx.crunGenerationTask.findMany({
      where: {
        reservationId: reservation.id,
        organizationId: reservation.organizationId,
        isDeleted: false,
      },
    });
    const ingredients = tasks.length
      ? await tx.ingredient.findMany({
          where: {
            id: { in: tasks.map((task) => task.ingredientId) },
            organizationId: reservation.organizationId,
            isDeleted: false,
          },
          select: { id: true, s3Key: true },
        })
      : [];
    const completion = crunReservationCompletion(
      reservation,
      tasks,
      ingredients,
    );
    if (completion === null || (completion !== undefined && completion !== 0))
      return this.walletSnapshot(reservation, tx);

    const nextStatus =
      input.reason === 'expiry'
        ? CreditReservationStatus.EXPIRED
        : CreditReservationStatus.RELEASED;
    const claimed = await tx.creditReservation.updateMany({
      data: { status: nextStatus },
      where: scopedWhere(reservation.organizationId, {
        id: reservation.id,
        status: CreditReservationStatus.RESERVED,
        metadata: input.expectedReservationMetadata
          ? { equals: toPrismaJson(input.expectedReservationMetadata) }
          : undefined,
      }),
    });
    if (claimed.count !== 1) {
      const latest = await this.findReservation(input, tx);
      if (
        input.expectedReservationMetadata &&
        latest.status === CreditReservationStatus.RESERVED
      )
        throw new ReservationEvidenceChangedException();
      return this.walletSnapshot(latest, tx);
    }

    const snapshot = await this.creditBalanceService.applyDelta(
      reservation.organizationId,
      {
        billingAccountId: reservation.billingAccountId,
        heldDelta: -reservation.amount,
      },
      tx,
      reservation.id,
    );
    return snapshot;
  }

  async expireDue(now = new Date()): Promise<number> {
    // Enumerate organization identities at the system boundary, including archived
    // organizations that may still have held funds. Every wallet query below is scoped.
    let cursor: string | undefined;
    let expired = 0;
    for (;;) {
      const organizations = await this.prisma.organization.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          creditReservations: {
            some: {
              isDeleted: false,
              status: CreditReservationStatus.RESERVED,
              expiresAt: { lte: now },
            },
          },
        },
      });
      for (const organization of organizations)
        expired += await this.expireDueForOrganization(organization.id, now);
      if (organizations.length < 100) break;
      cursor = organizations[organizations.length - 1].id;
    }
    this.logger.log('Expired credit reservations', { expired });
    return expired;
  }

  private async expireDueForOrganization(
    organizationId: string,
    now: Date,
  ): Promise<number> {
    const due = await this.prisma.creditReservation.findMany({
      where: {
        organizationId,
        expiresAt: { lte: now },
        OR: [
          { workloadType: null },
          {
            workloadType: {
              notIn: [
                MEDIA_GENERATION_WORKLOAD_TYPE,
                MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
                WORKFLOW_GENERATION_WORKLOAD_TYPE,
              ],
            },
          },
        ],
        isDeleted: false,
        status: CreditReservationStatus.RESERVED,
      },
      take: 100,
    });

    let expired = 0;
    for (const reservation of due) {
      try {
        // Media reconciliation must inspect the output before releasing funds.
        if (
          [
            MEDIA_GENERATION_WORKLOAD_TYPE,
            MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
            WORKFLOW_GENERATION_WORKLOAD_TYPE,
          ].includes(reservation.workloadType ?? '')
        )
          continue;
        if (reservation.workloadType === 'interpolation') {
          if (!(await this.reconcileInterpolation(reservation, now))) continue;
        } else if (reservation.workloadType === LIVE_SESSION_WORKLOAD_TYPE) {
          await this.settleLiveSessionCeiling(reservation, now);
        } else {
          await this.release({
            organizationId: reservation.organizationId,
            reason: 'expiry',
            reservationId: reservation.id,
          });
        }
        expired += 1;
      } catch (error: unknown) {
        this.logger.error('Credit reservation expiry failed', error, {
          organizationId: reservation.organizationId,
          reservationId: reservation.id,
        });
      }
    }

    return expired;
  }

  private async reconcileInterpolation(
    reservation: {
      actorUserId: string | null;
      amount: number;
      id: string;
      organizationId: string;
      workloadId: string | null;
    },
    now: Date,
  ): Promise<boolean> {
    const ingredient = reservation.workloadId
      ? await this.prisma.ingredient.findFirst({
          where: {
            id: reservation.workloadId,
            organizationId: reservation.organizationId,
            isDeleted: false,
          },
          select: {
            status: true,
            metadata: { select: { externalId: true, isDeleted: true } },
          },
        })
      : null;
    if (
      ingredient?.metadata?.externalId &&
      !ingredient.metadata.isDeleted &&
      reservation.actorUserId
    ) {
      await this.settle({
        actorUserId: reservation.actorUserId,
        actualAmount: reservation.amount,
        description: 'Accepted interpolation recovery',
        organizationId: reservation.organizationId,
        reservationId: reservation.id,
        source: ActivitySource.VIDEO_GENERATION,
      });
      return true;
    }
    if (
      ingredient &&
      !ingredient.metadata?.externalId &&
      ['FAILED', 'REJECTED'].includes(String(ingredient.status))
    ) {
      await this.release({
        organizationId: reservation.organizationId,
        reservationId: reservation.id,
        reason: 'expiry',
      });
      return true;
    }
    await this.prisma.creditReservation.updateMany({
      where: {
        id: reservation.id,
        organizationId: reservation.organizationId,
        isDeleted: false,
        status: CreditReservationStatus.RESERVED,
      },
      data: { expiresAt: new Date(now.getTime() + 60 * 60 * 1000) },
    });
    this.logger.warn('Interpolation hold requires operator reconciliation', {
      organizationId: reservation.organizationId,
      reservationId: reservation.id,
      ingredientId: reservation.workloadId,
    });
    return false;
  }

  private async settleLiveSessionCeiling(
    reservation: {
      actorUserId: string | null;
      amount: number;
      id: string;
      organizationId: string;
    },
    now: Date,
  ): Promise<void> {
    await this.settle({
      actorUserId: reservation.actorUserId ?? reservation.organizationId,
      actualAmount: reservation.amount,
      description: 'Live session ceiling',
      organizationId: reservation.organizationId,
      reservationId: reservation.id,
      source: ActivitySource.VIDEO_GENERATION,
    });
    await this.prisma.liveSession.updateMany({
      data: {
        settledCredits: reservation.amount,
        status: LiveSessionStatus.TERMINATED,
        terminateReason: LiveSessionTerminateReason.CEILING,
        terminatedAt: now,
      },
      where: scopedWhere(reservation.organizationId, {
        reservationId: reservation.id,
        status: LiveSessionStatus.OPEN,
      }),
    });
  }

  private async findReservation(
    input: {
      organizationId: string;
      reservationId?: string;
      idempotencyKey?: string;
    },
    tx?: PrismaTransactionClient,
  ) {
    if (!input.reservationId && !input.idempotencyKey) {
      throw new BusinessLogicException('Reservation identity is required');
    }

    const reservation = await (tx ?? this.prisma).creditReservation.findFirst({
      where: scopedWhere(input.organizationId, {
        ...(input.reservationId ? { id: input.reservationId } : {}),
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      }),
    });

    if (!reservation) {
      throw new BusinessLogicException('Credit reservation not found');
    }

    return reservation;
  }

  private async walletSnapshot(
    reservation: {
      billingAccountId: string;
      id: string;
      organizationId: string;
    },
    tx: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot> {
    return this.creditBalanceService.toSnapshot(
      await this.creditBalanceService.getOrCreateBalance(
        reservation.organizationId,
        tx,
        reservation.billingAccountId,
        reservation.id,
      ),
    );
  }

  async runSerializable<T>(
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.transactionUtil.runInTransaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error: unknown) {
        if (
          !isCreditTransactionConflict(error) ||
          attempt === MAX_SERIALIZATION_RETRIES - 1
        ) {
          throw error;
        }
      }
    }
    throw new Error('Serializable reservation transition exhausted retries');
  }

  private readSource(value: string | null): ActivitySource | null {
    return (
      Object.values(ActivitySource).find((source) => source === value) ?? null
    );
  }

  private readMetadata(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...value }
      : null;
  }

  private errorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }

  private toReservation(row: {
    id: string;
    billingAccountId: string;
    organizationId: string;
    actorUserId: string | null;
    brandId: string | null;
    amount: number;
    settledAmount: number | null;
    status: string;
    workloadType: string | null;
    workloadId: string | null;
    idempotencyKey: string;
    description: string | null;
    source: string | null;
    metadata: unknown;
    expiresAt: Date;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ICreditReservation {
    return {
      actorUserId: row.actorUserId,
      amount: row.amount,
      billingAccountId: row.billingAccountId,
      brandId: row.brandId,
      createdAt: row.createdAt.toISOString(),
      description: row.description,
      expiresAt: row.expiresAt.toISOString(),
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      isDeleted: row.isDeleted,
      metadata: this.readMetadata(row.metadata),
      organizationId: row.organizationId,
      settledAmount: row.settledAmount,
      source: this.readSource(row.source),
      status: parseCreditReservationStatus(row.status),
      updatedAt: row.updatedAt.toISOString(),
      workloadId: row.workloadId,
      workloadType: row.workloadType,
    };
  }
}
