import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  CreditTransactionCategory,
  parseCreditReservationStatus,
} from '@genfeedai/contracts';
import type {
  ICreditReservation,
  ICreditWalletSnapshot,
  IReleaseCreditReservationInput,
  IReserveCreditsInput,
  ISettleCreditReservationInput,
} from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const DEFAULT_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SERIALIZATION_RETRIES = 3;
const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

type ReserveCreditsInput = IReserveCreditsInput & {
  billingAccountId: string;
};

@Injectable()
export class CreditReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly transactionUtil: TransactionUtil,
  ) {}

  async reserve(input: ReserveCreditsInput): Promise<ICreditReservation> {
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
            actorUserId: input.actorUserId,
            amount: input.amount,
            billingAccountId: input.billingAccountId,
            expiresAt:
              input.expiresAt ??
              new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS),
            idempotencyKey: input.idempotencyKey,
            organizationId: input.organizationId,
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

  async settle(
    input: ISettleCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    if (!Number.isFinite(input.actualAmount) || input.actualAmount < 0) {
      throw new BusinessLogicException(
        'Settlement amount must be finite and non-negative',
      );
    }

    return this.runSerializable(async (tx) => {
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

      if (reservation.status !== CreditReservationStatus.RESERVED) {
        throw new BusinessLogicException(
          `Reservation ${reservation.status} cannot be settled`,
        );
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

      const claimed = await tx.creditReservation.updateMany({
        data: {
          settledAmount: input.actualAmount,
          status: CreditReservationStatus.SETTLED,
        },
        where: {
          id: reservation.id,
          isDeleted: false,
          organizationId: reservation.organizationId,
          status: CreditReservationStatus.RESERVED,
        },
      });
      if (claimed.count !== 1) {
        const latest = await this.findReservation(input, tx);
        if (
          latest.status === CreditReservationStatus.SETTLED &&
          latest.settledAmount === input.actualAmount
        ) {
          return this.walletSnapshot(latest, tx);
        }
        throw new BusinessLogicException(
          `Reservation ${latest.status} cannot be settled`,
        );
      }

      const snapshot = await this.creditBalanceService.applyDelta(
        reservation.organizationId,
        {
          balanceDelta: -input.actualAmount,
          billingAccountId: reservation.billingAccountId,
          heldDelta: -reservation.amount,
        },
        tx,
      );

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
          referenceId: reservation.id,
          referenceType: 'credit_reservation',
        },
      );

      await tx.creditTransaction.updateMany({
        data: {
          actorUserId: input.actorUserId,
          billingAccountId: reservation.billingAccountId,
          reservationId: reservation.id,
        },
        where: {
          organizationId: reservation.organizationId,
          referenceId: reservation.id,
          referenceType: 'credit_reservation',
        },
      });

      return snapshot;
    });
  }

  async release(
    input: IReleaseCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.runSerializable(async (tx) => {
      const reservation = await this.findReservation(input, tx);
      if (reservation.status !== CreditReservationStatus.RESERVED) {
        return this.walletSnapshot(reservation, tx);
      }

      const nextStatus =
        input.reason === 'expiry'
          ? CreditReservationStatus.EXPIRED
          : CreditReservationStatus.RELEASED;
      const claimed = await tx.creditReservation.updateMany({
        data: { status: nextStatus },
        where: {
          id: reservation.id,
          isDeleted: false,
          organizationId: reservation.organizationId,
          status: CreditReservationStatus.RESERVED,
        },
      });
      if (claimed.count !== 1) {
        return this.walletSnapshot(await this.findReservation(input, tx), tx);
      }

      const snapshot = await this.creditBalanceService.applyDelta(
        reservation.organizationId,
        {
          billingAccountId: reservation.billingAccountId,
          heldDelta: -reservation.amount,
        },
        tx,
      );
      return snapshot;
    });
  }

  async expireDue(now = new Date()): Promise<number> {
    // tenant-scope-ignore: platform maintenance sweep — every candidate carries
    // its organizationId and release is re-scoped before mutating its wallet
    const due = await this.prisma.creditReservation.findMany({
      where: {
        expiresAt: { lte: now },
        isDeleted: false,
        status: CreditReservationStatus.RESERVED,
      },
      take: 100,
    });

    let expired = 0;
    for (const reservation of due) {
      try {
        await this.release({
          organizationId: reservation.organizationId,
          reason: 'expiry',
          reservationId: reservation.id,
        });
        expired += 1;
      } catch (error: unknown) {
        this.logger.error('Credit reservation expiry failed', error, {
          organizationId: reservation.organizationId,
          reservationId: reservation.id,
        });
      }
    }

    this.logger.log('Expired credit reservations', { expired });
    return expired;
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
    reservation: { billingAccountId: string; organizationId: string },
    tx: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot> {
    return this.creditBalanceService.toSnapshot(
      await this.creditBalanceService.getOrCreateBalance(
        reservation.organizationId,
        tx,
        reservation.billingAccountId,
      ),
    );
  }

  private async runSerializable<T>(
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.transactionUtil.runInTransaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error: unknown) {
        if (
          this.errorCode(error) !== PRISMA_SERIALIZATION_FAILURE ||
          attempt === MAX_SERIALIZATION_RETRIES - 1
        ) {
          throw error;
        }
      }
    }
    throw new Error('Serializable reservation transition exhausted retries');
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
    amount: number;
    settledAmount: number | null;
    status: string;
    workloadType: string | null;
    workloadId: string | null;
    idempotencyKey: string;
    expiresAt: Date;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ICreditReservation {
    return {
      actorUserId: row.actorUserId,
      amount: row.amount,
      billingAccountId: row.billingAccountId,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      isDeleted: row.isDeleted,
      organizationId: row.organizationId,
      settledAmount: row.settledAmount,
      status: parseCreditReservationStatus(row.status),
      updatedAt: row.updatedAt.toISOString(),
      workloadId: row.workloadId,
      workloadType: row.workloadType,
    };
  }
}
