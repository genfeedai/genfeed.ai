import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type PaidSubscriptionSnapshot,
  resolveOrganizationPaidGrant,
} from '@api/common/subscriptions/paid-subscription-access.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ActivitySource,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@genfeedai/contracts';
import {
  LIFETIME_DEAL_CREDIT_EXPIRY_DAYS,
  LIFETIME_DEAL_GRANT_REFERENCE_TYPE,
  LIFETIME_DEAL_MAX_CATCH_UP_GRANTS,
  LIFETIME_DEAL_PERIOD_END,
  LIFETIME_DEAL_SEAT_CAP,
  lifetimeGrantReferenceId,
  nextLifetimeGrantDate,
} from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEAT_CLAIM_LOCK_KEY = 'lifetime-deal:seat-claim';
const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

export interface LifetimeDealAvailability {
  claimed: number;
  remaining: number;
  total: number;
}

export interface LifetimeSeatClaimInput {
  monthlyCredits: number;
  organizationId: string;
  stripeCheckoutSessionId: string;
  userId: string;
}

export type LifetimeSeatClaim =
  | { outcome: 'claimed'; seatId: string; seatNumber: number }
  | { outcome: 'already_claimed'; seatId: string; seatNumber: number }
  | { outcome: 'sold_out' };

export interface LifetimeGrantTotals {
  failed: number;
  grants: number;
  seats: number;
}

/**
 * The capped lifetime deal: the seat counter, the claim that turns a paid
 * checkout into a seat, and the monthly credit grants a seat earns.
 *
 * A seat holder's organization carries a `lifetime` subscription row with an
 * open-ended period, so every paid-access gate that already reads
 * subscription rows treats it as paid without a change of its own.
 */
@Injectable()
export class LifetimeDealService {
  private readonly context = { service: LifetimeDealService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  async getAvailability(): Promise<LifetimeDealAvailability> {
    const claimed = await this.prisma.lifetimeDealSeat.count();
    return {
      claimed,
      remaining: Math.max(0, LIFETIME_DEAL_SEAT_CAP - claimed),
      total: LIFETIME_DEAL_SEAT_CAP,
    };
  }

  async isLifetimeOrganization(organizationId: string): Promise<boolean> {
    const seat = await this.prisma.lifetimeDealSeat.findUnique({
      select: { id: true },
      where: { organizationId },
    });
    return seat !== null;
  }

  /**
   * Rejects a lifetime checkout the organization cannot complete: every seat
   * is taken, or it already pays through a subscription. Seats are claimed
   * only after payment, so this check keeps a buyer from paying into a race
   * they can already see they would lose; the claim itself stays the cap.
   */
  async assertSeatPurchasable(
    subscription: PaidSubscriptionSnapshot | null,
  ): Promise<void> {
    if (
      subscription &&
      resolveOrganizationPaidGrant([subscription], null, new Date())
    ) {
      throw new BadRequestException(
        'This organization already has a paid plan. Cancel it before buying the lifetime plan.',
      );
    }
    if ((await this.getAvailability()).remaining === 0) {
      throw new ConflictException('All lifetime seats are taken.');
    }
  }

  /**
   * Claims the next seat for a paid checkout session. Safe to replay: the
   * same session returns its existing seat, and the 101st payer gets
   * `sold_out` so the caller can refund. The advisory lock serialises
   * claims, so the count and the insert cannot interleave across workers.
   */
  async claimSeat(input: LifetimeSeatClaimInput): Promise<LifetimeSeatClaim> {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SEAT_CLAIM_LOCK_KEY}, 0))::text`;

      const existing = await tx.lifetimeDealSeat.findFirst({
        select: { id: true, seatNumber: true },
        where: {
          OR: [
            { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
            { organizationId: input.organizationId },
          ],
        },
      });
      if (existing) {
        return {
          outcome: 'already_claimed' as const,
          seatId: existing.id,
          seatNumber: existing.seatNumber,
        };
      }

      const highest = await tx.lifetimeDealSeat.aggregate({
        _count: { _all: true },
        _max: { seatNumber: true },
      });
      if (highest._count._all >= LIFETIME_DEAL_SEAT_CAP) {
        return { outcome: 'sold_out' as const };
      }

      const now = new Date();
      const seat = await tx.lifetimeDealSeat.create({
        data: {
          monthlyCredits: input.monthlyCredits,
          nextCreditGrantAt: now,
          organizationId: input.organizationId,
          seatNumber: (highest._max.seatNumber ?? 0) + 1,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        },
        select: { id: true, seatNumber: true },
      });

      await this.markSubscriptionLifetime(tx, input, now);

      return {
        outcome: 'claimed' as const,
        seatId: seat.id,
        seatNumber: seat.seatNumber,
      };
    });
  }

  /**
   * Grants every monthly allowance a seat has fallen due for, one calendar
   * month at a time, oldest first. A grant is keyed by seat and due date, so a
   * retry after a crash skips the grant that already landed and only moves the
   * due date forward.
   */
  async grantDueCredits(
    seatId: string,
    now: Date = new Date(),
  ): Promise<number> {
    let granted = 0;
    for (let i = 0; i < LIFETIME_DEAL_MAX_CATCH_UP_GRANTS; i++) {
      const seat = await this.prisma.lifetimeDealSeat.findUnique({
        select: {
          id: true,
          monthlyCredits: true,
          nextCreditGrantAt: true,
          organizationId: true,
        },
        where: { id: seatId },
      });
      if (!seat || seat.nextCreditGrantAt.getTime() > now.getTime()) {
        break;
      }

      const referenceId = lifetimeGrantReferenceId(
        seat.id,
        seat.nextCreditGrantAt,
      );
      if (!(await this.hasGrant(seat.organizationId, referenceId))) {
        await this.addGrant(
          seat.organizationId,
          seat.monthlyCredits,
          referenceId,
          now,
        );
        granted += seat.monthlyCredits;
      }

      const advanced = await this.prisma.lifetimeDealSeat.updateMany({
        data: {
          nextCreditGrantAt: nextLifetimeGrantDate(seat.nextCreditGrantAt),
        },
        where: { id: seat.id, nextCreditGrantAt: seat.nextCreditGrantAt },
      });
      if (advanced.count === 0) {
        break;
      }
    }
    return granted;
  }

  /** Seats with a monthly grant due, oldest due date first, one page at a time. */
  async findSeatsDue(
    now: Date,
    cursor: string | undefined,
    take: number,
  ): Promise<string[]> {
    const seats = await this.prisma.lifetimeDealSeat.findMany({
      orderBy: { id: 'asc' },
      select: { id: true },
      take,
      where: {
        nextCreditGrantAt: { lte: now },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
    });
    return seats.map((seat) => seat.id);
  }

  /** One sweep: grants every due seat. A failing seat is logged and retried next tick. */
  async grantAllDueCredits(
    now: Date = new Date(),
    pageSize = 100,
  ): Promise<LifetimeGrantTotals> {
    const totals: LifetimeGrantTotals = { failed: 0, grants: 0, seats: 0 };
    let cursor: string | undefined;
    while (true) {
      const seatIds = await this.findSeatsDue(now, cursor, pageSize);
      for (const seatId of seatIds) {
        totals.seats += 1;
        try {
          if ((await this.grantDueCredits(seatId, now)) > 0) {
            totals.grants += 1;
          }
        } catch (error: unknown) {
          totals.failed += 1;
          this.logger.error('Lifetime deal credit grant failed', {
            ...this.context,
            error: error instanceof Error ? error.message : String(error),
            seatId,
          });
        }
      }
      if (seatIds.length < pageSize) {
        return totals;
      }
      cursor = seatIds[seatIds.length - 1];
    }
  }

  private async markSubscriptionLifetime(
    tx: Prisma.TransactionClient,
    input: LifetimeSeatClaimInput,
    now: Date,
  ): Promise<void> {
    const data = {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: LIFETIME_DEAL_PERIOD_END,
      currentPeriodStart: now,
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
    };
    const existing = await tx.subscription.findFirst({
      select: { id: true },
      where: scopedWhere(input.organizationId),
    });
    if (existing) {
      await tx.subscription.update({ data, where: { id: existing.id } });
      return;
    }
    await tx.subscription.create({
      data: {
        ...data,
        organizationId: input.organizationId,
        userId: input.userId,
      },
    });
  }

  private async hasGrant(
    organizationId: string,
    referenceId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        referenceId,
        referenceType: LIFETIME_DEAL_GRANT_REFERENCE_TYPE,
      }),
    });
    return existing !== null;
  }

  private async addGrant(
    organizationId: string,
    credits: number,
    referenceId: string,
    now: Date,
  ): Promise<void> {
    try {
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        organizationId,
        credits,
        ActivitySource.SUBSCRIPTION,
        'Lifetime plan monthly credits',
        new Date(now.getTime() + LIFETIME_DEAL_CREDIT_EXPIRY_DAYS * ONE_DAY_MS),
        { referenceId, referenceType: LIFETIME_DEAL_GRANT_REFERENCE_TYPE },
      );
    } catch (error: unknown) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code !== UNIQUE_CONSTRAINT_ERROR_CODE) {
        throw error;
      }
    }
  }
}
