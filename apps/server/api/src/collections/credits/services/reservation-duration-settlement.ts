import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type DurationSettlement,
  readHeldDurationQuote,
  resolveDurationSettlement,
} from '@api/collections/credits/services/generation-duration-settlement';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import { MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS } from '@genfeedai/contracts/constants';
import type { ICreditReservation } from '@genfeedai/contracts/interfaces/billing';
import type { LoggerService } from '@libs/logger/logger.service';

/** Ledger key of the overrun charged on top of a caller-owned hold. */
export function reservationDurationTopUpKey(reservationId: string): string {
  return `reservation-duration-topup:${reservationId}`;
}

export interface ReservationDurationSettlementInput {
  organizationId: string;
  actorUserId: string;
  brandId?: string | null;
  description: string;
  source?: ActivitySource;
  /** The hold, found by the workload it was reserved for (and keyed by). */
  workloadType: string;
  workloadId: string;
  /** The hold id the caller recorded, used when the lookup finds none. */
  reservationId?: string;
  /** What the hold settles at when it carries no per-second quote. */
  fallbackCredits: number;
  /** The measured length of the delivered clip, when one is known. */
  actualSeconds?: number;
}

export interface ReservationDurationSettlement {
  /** Credits the hold settled at (never above the hold). */
  settledCredits: number;
  /** Credits charged on top of the hold for a clip that ran longer. */
  topUpCredits: number;
}

type SettlementCredits = Pick<
  CreditsUtilsService,
  | 'deductCreditsFromOrganization'
  | 'findReservationForWorkload'
  | 'settleReservation'
>;

/**
 * Settles a hold its caller owns (a remix scene, a Turbo idea) to the clip
 * length the provider returned, the same way the service-owned media hold
 * settles on the webhook (`queueHoldSettlement`). A hold that carries a
 * frozen per-second quote (`avatarDurationQuote`) is re-priced at
 * `actualSeconds`: the unused part is refunded by settling below the hold, and
 * an overrun is a separate deduction keyed by the hold.
 *
 * Retries are idempotent. A hold that already settled keeps its recorded
 * amount (the reservation is the source of truth, not a recomputation), and
 * the top-up key admits one overrun charge per hold. A released or expired
 * hold throws `UnsettleableReservationException` before any top-up.
 */
export async function settleReservationAtDuration(
  deps: { credits: SettlementCredits; logger?: LoggerService },
  input: ReservationDurationSettlementInput,
): Promise<ReservationDurationSettlement> {
  const reservation = await deps.credits.findReservationForWorkload({
    organizationId: input.organizationId,
    workloadId: input.workloadId,
    workloadType: input.workloadType,
  });
  const quote = reservation
    ? readHeldDurationQuote(reservation.metadata)
    : undefined;
  if (!reservation || !quote) {
    const reservationId = reservation?.id ?? input.reservationId;
    await deps.credits.settleReservation({
      actorUserId: input.actorUserId,
      actualAmount: input.fallbackCredits,
      ...(input.brandId ? { brandId: input.brandId } : {}),
      description: input.description,
      ...(reservationId
        ? { reservationId }
        : { idempotencyKey: input.workloadId }),
      organizationId: input.organizationId,
      ...(input.source ? { source: input.source } : {}),
    });
    return { settledCredits: input.fallbackCredits, topUpCredits: 0 };
  }

  const settlement = resolveDurationSettlement(
    reservation.amount,
    quote,
    input.actualSeconds,
  );
  if (settlement.unresolvedReason)
    deps.logger?.warn(
      'Per-second generation settled at its admission estimate',
      {
        organizationId: input.organizationId,
        reason: settlement.unresolvedReason,
        reservationId: reservation.id,
      },
    );
  const settledCredits = await settleHold(deps.credits, input, reservation, {
    durationSettlement: {
      actualCredits: settlement.actualCredits ?? null,
      actualSeconds: settlement.actualSeconds ?? null,
      estimatedSeconds: quote.estimatedSeconds,
      heldCredits: reservation.amount,
    },
    settlement,
  });
  // An overrun only follows a hold that settled whole; a hold an earlier
  // attempt already settled below its amount was a shorter clip.
  const topUpCredits =
    settledCredits === reservation.amount ? settlement.topUpCredits : 0;
  if (topUpCredits > 0)
    await deps.credits.deductCreditsFromOrganization(
      input.organizationId,
      input.actorUserId,
      topUpCredits,
      `${input.description} (duration top-up)`,
      input.source ?? ActivitySource.SCRIPT,
      {
        ...(input.brandId ? { brandId: input.brandId } : {}),
        idempotencyKey: reservationDurationTopUpKey(reservation.id),
        // The same overdraft bound the service-owned top-up and the late
        // completion charge allow: the clip was delivered, so it is owed.
        maxOverdraftCredits:
          MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
        metadata: { durationTopUpOfReservationId: reservation.id },
      },
    );
  return { settledCredits, topUpCredits };
}

/** Settles the hold once; a retry returns the amount it already settled at. */
async function settleHold(
  credits: SettlementCredits,
  input: ReservationDurationSettlementInput,
  reservation: ICreditReservation,
  evidence: {
    durationSettlement: Record<string, number | null>;
    settlement: DurationSettlement;
  },
): Promise<number> {
  if (
    reservation.status === CreditReservationStatus.SETTLED &&
    reservation.settledAmount !== null
  )
    return reservation.settledAmount;
  await credits.settleReservation({
    actorUserId: input.actorUserId,
    actualAmount: evidence.settlement.settleCredits,
    ...(input.brandId ? { brandId: input.brandId } : {}),
    description: input.description,
    metadata: { durationSettlement: evidence.durationSettlement },
    organizationId: input.organizationId,
    reservationId: reservation.id,
    ...(input.source ? { source: input.source } : {}),
  });
  return evidence.settlement.settleCredits;
}
