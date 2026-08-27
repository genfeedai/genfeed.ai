import {
  ActivitySource,
  CreditReservationStatus,
  CreditTransactionCategory,
  parseCreditReservationStatus,
} from '@genfeedai/enums';
import type {
  ICreditReservation,
  ICreditWalletSnapshot,
  IReleaseCreditReservationInput,
  IReserveCreditsInput,
  ISettleCreditReservationInput,
} from '@genfeedai/interfaces/billing';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { CreditBalanceService } from '@server/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@server/collections/credits/services/credit-transactions.service';
import { BusinessLogicException } from '@server/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@server/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@server/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const DEFAULT_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

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

    const existing = await this.prisma.creditReservation.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
    if (existing) {
      return this.toReservation(existing);
    }

    const run = async (tx: PrismaTransactionClient) => {
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
    };

    return this.transactionUtil.runInTransaction((tx) => run(tx), {
      isolationLevel: 'Serializable',
    });
  }

  async settle(
    input: ISettleCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    const reservation = await this.findReservation(input);
    if (reservation.status === CreditReservationStatus.SETTLED) {
      return this.creditBalanceService.toSnapshot(
        await this.creditBalanceService.getOrCreateBalance(
          reservation.organizationId,
          undefined,
          reservation.billingAccountId,
        ),
      );
    }

    if (reservation.status !== CreditReservationStatus.RESERVED) {
      throw new BusinessLogicException(
        `Reservation ${reservation.status} cannot be settled`,
      );
    }

    if (!Number.isFinite(input.actualAmount) || input.actualAmount < 0) {
      throw new BusinessLogicException(
        'Settlement amount must be finite and non-negative',
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

    const run = async (tx: PrismaTransactionClient) => {
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

      await tx.creditReservation.update({
        data: {
          settledAmount: input.actualAmount,
          status: CreditReservationStatus.SETTLED,
        },
        where: { id: reservation.id },
      });

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
    };

    return this.transactionUtil.runInTransaction((tx) => run(tx), {
      isolationLevel: 'Serializable',
    });
  }

  async release(
    input: IReleaseCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    const reservation = await this.findReservation(input);
    if (
      reservation.status === CreditReservationStatus.RELEASED ||
      reservation.status === CreditReservationStatus.EXPIRED
    ) {
      return this.creditBalanceService.toSnapshot(
        await this.creditBalanceService.getOrCreateBalance(
          reservation.organizationId,
          undefined,
          reservation.billingAccountId,
        ),
      );
    }

    if (reservation.status !== CreditReservationStatus.RESERVED) {
      throw new BusinessLogicException(
        `Reservation ${reservation.status} cannot be released`,
      );
    }

    const nextStatus =
      input.reason === 'expiry'
        ? CreditReservationStatus.EXPIRED
        : CreditReservationStatus.RELEASED;

    const run = async (tx: PrismaTransactionClient) => {
      const snapshot = await this.creditBalanceService.applyDelta(
        reservation.organizationId,
        {
          billingAccountId: reservation.billingAccountId,
          heldDelta: -reservation.amount,
        },
        tx,
      );
      await tx.creditReservation.update({
        data: { status: nextStatus },
        where: { id: reservation.id },
      });
      return snapshot;
    };

    return this.transactionUtil.runInTransaction((tx) => run(tx), {
      isolationLevel: 'Serializable',
    });
  }

  async expireDue(now = new Date()): Promise<number> {
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
      await this.release({
        organizationId: reservation.organizationId,
        reason: 'expiry',
        reservationId: reservation.id,
      });
      expired += 1;
    }

    this.logger.log('Expired credit reservations', { expired });
    return expired;
  }

  private async findReservation(input: {
    organizationId: string;
    reservationId?: string;
    idempotencyKey?: string;
  }) {
    if (!input.reservationId && !input.idempotencyKey) {
      throw new BusinessLogicException('Reservation identity is required');
    }

    const reservation = await this.prisma.creditReservation.findFirst({
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
