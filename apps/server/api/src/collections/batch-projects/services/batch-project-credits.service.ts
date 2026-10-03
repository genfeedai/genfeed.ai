import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import {
  type ActivitySource,
  CreditReservationStatus,
} from '@genfeedai/contracts';
import type { IBatchProjectItemDispatch } from '@genfeedai/contracts/interfaces';
import { ConflictException, Injectable } from '@nestjs/common';

/** Media settlement can take days; keep the hold one day past the retries. */
const IDEA_RESERVATION_TTL_MS = 8 * 24 * 60 * 60_000;

/**
 * Credit holds for server-side idea generation (#5463), following the Brand
 * Remix contract: one accepted quote line is reserved right before its
 * provider call, settled when a usable output lands, and released when the
 * generation fails. Lines paid with the organization's own key never touch
 * platform credits.
 */
@Injectable()
export class BatchProjectCreditsService {
  constructor(private readonly credits: CreditsUtilsService) {}

  /**
   * Hold a line's credits. The hold is keyed by the dispatch key, so a
   * repeated job reuses it; a hold that was already released or expired is
   * never reused, so refunded work cannot run again unbilled.
   */
  async reserve(input: {
    actorUserId: string;
    brandId?: string | null;
    dispatch: IBatchProjectItemDispatch;
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
      organizationId: input.organizationId,
      workloadId: dispatch.key,
      workloadType: 'batch-project-idea',
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
   */
  async settle(input: {
    actorUserId: string;
    brandId?: string | null;
    description: string;
    dispatch: IBatchProjectItemDispatch;
    organizationId: string;
    source: ActivitySource;
  }): Promise<'released' | 'settled'> {
    const { dispatch } = input;
    if (dispatch.billingMode === 'byok' || dispatch.credits <= 0) {
      return 'settled';
    }
    try {
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
      return 'settled';
    } catch (error: unknown) {
      if (error instanceof UnsettleableReservationException) {
        return 'released';
      }
      throw error;
    }
  }

  /** Return the hold of a line whose generation failed. */
  async release(input: {
    dispatch: IBatchProjectItemDispatch;
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
