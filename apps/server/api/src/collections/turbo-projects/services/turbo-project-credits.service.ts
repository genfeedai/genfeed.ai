import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { settleReservationAtDuration } from '@api/collections/credits/services/reservation-duration-settlement';
import type { AvatarDurationQuote } from '@api/collections/videos/services/avatar-video-generation.types';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import {
  type ActivitySource,
  CreditReservationStatus,
} from '@genfeedai/contracts';
import type { ITurboProjectItemDispatch } from '@genfeedai/contracts/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';

/** Media settlement can take days; keep the hold one day past the retries. */
const IDEA_RESERVATION_TTL_MS = 8 * 24 * 60 * 60_000;
const IDEA_WORKLOAD_TYPE = 'turbo-project-idea';

export type TurboIdeaSettlement =
  | { state: 'released' }
  | { settledCredits: number; state: 'settled' };

/**
 * Credit holds for server-side idea generation (#5463), following the Brand
 * Remix contract: one accepted quote line is reserved right before its
 * provider call, settled when a usable output lands, and released when the
 * generation fails. Lines paid with the organization's own key never touch
 * platform credits.
 */
@Injectable()
export class TurboProjectCreditsService {
  constructor(private readonly credits: CreditsUtilsService) {}

  /**
   * Hold a line's credits. The hold is keyed by the dispatch key, so a
   * repeated job reuses it; a hold that was already released or expired is
   * never reused, so refunded work cannot run again unbilled. A per-second
   * avatar's frozen quote is kept on the hold, so settlement re-prices it at
   * the clip length HeyGen returns.
   */
  async reserve(input: {
    actorUserId: string;
    brandId?: string | null;
    dispatch: ITurboProjectItemDispatch;
    durationQuote?: AvatarDurationQuote;
    organizationId: string;
  }): Promise<string | undefined> {
    const { dispatch } = input;
    if (dispatch.billingMode === 'byok' || dispatch.credits <= 0) {
      return undefined;
    }
    const reservation = await this.credits.reserveCredits({
      actorUserId: input.actorUserId,
      amount: dispatch.credits,
      ...(input.brandId ? { brandId: input.brandId } : {}),
      expiresAt: new Date(Date.now() + IDEA_RESERVATION_TTL_MS),
      idempotencyKey: dispatch.key,
      ...(input.durationQuote
        ? { metadata: { avatarDurationQuote: input.durationQuote } }
        : {}),
      organizationId: input.organizationId,
      workloadId: dispatch.key,
      workloadType: IDEA_WORKLOAD_TYPE,
    });
    if (
      reservation.status === CreditReservationStatus.RELEASED ||
      reservation.status === CreditReservationStatus.EXPIRED
    ) {
      throw new ConflictException(
        'This accepted generation was already refunded. Request a new quote.',
      );
    }
    return reservation.id;
  }

  /**
   * Charge a line whose output is usable. A hold that expired or was released
   * before the output arrived is reported as released instead of charged.
   * An avatar line (`clip`) settles to the clip's measured length: a shorter
   * clip refunds the rest of the hold, a longer one is topped up.
   */
  async settle(input: {
    actorUserId: string;
    brandId?: string | null;
    clip?: { durationSeconds?: number };
    description: string;
    dispatch: ITurboProjectItemDispatch;
    organizationId: string;
    source: ActivitySource;
  }): Promise<TurboIdeaSettlement> {
    const { dispatch } = input;
    if (dispatch.billingMode === 'byok' || dispatch.credits <= 0) {
      return { settledCredits: 0, state: 'settled' };
    }
    try {
      if (input.clip) {
        const settled = await settleReservationAtDuration(
          { credits: this.credits },
          {
            actorUserId: input.actorUserId,
            ...(input.clip.durationSeconds !== undefined
              ? { actualSeconds: input.clip.durationSeconds }
              : {}),
            brandId: input.brandId,
            description: input.description,
            fallbackCredits: dispatch.credits,
            organizationId: input.organizationId,
            ...(dispatch.reservationId
              ? { reservationId: dispatch.reservationId }
              : {}),
            source: input.source,
            workloadId: dispatch.key,
            workloadType: IDEA_WORKLOAD_TYPE,
          },
        );
        return {
          settledCredits: settled.settledCredits + settled.topUpCredits,
          state: 'settled',
        };
      }
      await this.credits.settleReservation({
        actorUserId: input.actorUserId,
        actualAmount: dispatch.credits,
        ...(input.brandId ? { brandId: input.brandId } : {}),
        description: input.description,
        organizationId: input.organizationId,
        source: input.source,
        ...(dispatch.reservationId
          ? { reservationId: dispatch.reservationId }
          : { idempotencyKey: dispatch.key }),
      });
      return { settledCredits: dispatch.credits, state: 'settled' };
    } catch (error: unknown) {
      if (error instanceof UnsettleableReservationException) {
        return { state: 'released' };
      }
      throw error;
    }
  }

  /** Return the hold of a line whose generation failed. */
  async release(input: {
    dispatch: ITurboProjectItemDispatch;
    organizationId: string;
  }): Promise<void> {
    const { dispatch } = input;
    if (dispatch.billingMode === 'byok' || dispatch.credits <= 0) {
      return;
    }
    await this.credits.releaseReservation({
      organizationId: input.organizationId,
      ...(dispatch.reservationId
        ? { reservationId: dispatch.reservationId }
        : { idempotencyKey: dispatch.key }),
    });
  }
}
