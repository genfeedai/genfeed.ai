import { randomUUID } from 'node:crypto';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ActivitySource } from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';

type TextHoldCreditsClient = Pick<
  CreditsUtilsService,
  | 'deductCreditsFromOrganization'
  | 'releaseReservation'
  | 'reserveCredits'
  | 'settleReservation'
>;

/** Credits held for one text call, taken before the provider is called. */
export interface TextCreditHold {
  heldCredits: number;
  reservationId: string;
  /** Keys the overflow charge, so a retried settle never bills it twice. */
  idempotencyKey: string;
}

interface TextCreditScope {
  brandId?: string | null;
  organizationId: string;
  source: ActivitySource;
  userId: string;
}

/**
 * Hold the credits a text call needs before the provider runs.
 *
 * The hold is taken from the same balance every concurrent call reads, so an
 * organization that can pay for one call cannot start two: the second hold is
 * refused with the ledger's `INSUFFICIENT_CREDITS` business error, and nothing
 * has run yet. Pair every hold with {@link settleTextCredits} on success or
 * {@link releaseTextCredits} on failure.
 */
export const reserveTextCredits = traced(
  'reserveTextCredits',
  async (
    credits: Pick<TextHoldCreditsClient, 'reserveCredits'>,
    params: TextCreditScope & {
      description: string;
      holdCredits: number;
      workloadType: string;
    },
  ): Promise<TextCreditHold> => {
    const idempotencyKey = `${params.workloadType}:${randomUUID()}`;
    const reservation = await credits.reserveCredits({
      actorUserId: params.userId,
      amount: params.holdCredits,
      ...(params.brandId ? { brandId: params.brandId } : {}),
      description: params.description,
      idempotencyKey,
      organizationId: params.organizationId,
      source: params.source,
      workloadId: idempotencyKey,
      workloadType: params.workloadType,
    });
    return {
      heldCredits: reservation.amount ?? params.holdCredits,
      idempotencyKey,
      reservationId: reservation.id,
    };
  },
);

/**
 * Bill a finished text call against its hold. The hold is settled at the
 * actual price, up to what it holds. A call that cost more than its hold has
 * already run, so the remainder is deducted with an overdraft allowance of
 * exactly that remainder: the overshoot is bounded by one call and is never
 * gifted. A call that cost nothing releases the hold.
 */
export const settleTextCredits = traced(
  'settleTextCredits',
  async (
    credits: TextHoldCreditsClient,
    hold: TextCreditHold,
    params: TextCreditScope & { actualCredits: number; description: string },
  ): Promise<void> => {
    if (!(params.actualCredits > 0)) {
      await releaseTextCredits(credits, hold, params.organizationId);
      return;
    }

    const settledCredits = Math.min(params.actualCredits, hold.heldCredits);
    await credits.settleReservation({
      actorUserId: params.userId,
      actualAmount: settledCredits,
      ...(params.brandId ? { brandId: params.brandId } : {}),
      description: params.description,
      organizationId: params.organizationId,
      reservationId: hold.reservationId,
      source: params.source,
    });

    const overflowCredits = Number(
      (params.actualCredits - settledCredits).toFixed(6),
    );
    if (overflowCredits <= 0) return;

    await credits.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      overflowCredits,
      `${params.description} (beyond hold)`,
      params.source,
      {
        brandId: params.brandId,
        idempotencyKey: `${hold.idempotencyKey}:overflow`,
        maxOverdraftCredits: overflowCredits,
        referenceId: hold.reservationId,
        referenceType: 'text_credit_overflow',
      },
    );
  },
);

/** Give a hold back after a call that failed before it could be billed. */
export const releaseTextCredits = traced(
  'releaseTextCredits',
  async (
    credits: Pick<TextHoldCreditsClient, 'releaseReservation'>,
    hold: TextCreditHold | undefined,
    organizationId: string,
  ): Promise<void> => {
    if (!hold) return;
    // A hold that cannot be released expires on its own, so this never throws
    // over the error that made the call fail.
    await credits
      .releaseReservation({ organizationId, reservationId: hold.reservationId })
      .catch(() => undefined);
  },
);
