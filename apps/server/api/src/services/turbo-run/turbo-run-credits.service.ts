import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { scopedWhere } from '@api/index';
import {
  type TurboRunConfig,
  type TurboRunCreditsLedger,
  resolveTurboRunItems,
} from '@api/services/turbo-run/turbo-run.types';
import { turboRunItemRowsReadArgs } from '@api/services/turbo-run/turbo-run-item-rows';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, TurboRunItemStatus } from '@genfeedai/contracts';
import {
  type TurboRunPricingOptions,
  reconcileTurboRunCredits,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/** Refunded credits expire a year out, matching other refund paths. */
const REFUND_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

/** Compare-and-swap retries before a settlement gives up for this tick. */
const SETTLE_MAX_ATTEMPTS = 3;

/** Durable credit-ledger idempotency namespace for a batch's one settlement. */
const TURBO_RUN_SETTLEMENT_REFERENCE_TYPE = 'turbo-run:settlement';

export type TurboRunCreditsSettlement = {
  /** Extra credits deducted to reach the price of what landed. */
  additionalCredits: number;
  /** True when another settlement already owned this batch — nothing moved. */
  isAlreadySettled: boolean;
  /** Credits handed back because the up-front estimate overshot. */
  refundCredits: number;
  /** Net credits this batch is billed, after settlement. */
  settledCredits: number;
};

/**
 * Owns the credit ledger on a batch.
 *
 * The JSON ledger is the batch's settlement claim. Ordinarily its
 * `chargedCredits` matches credits already moved; if a post-claim deduction
 * fails, the typed `settlementShortfall` column is the durable exception.
 * Replaying settlement still moves nothing, and only that stored marker may
 * retry the missing amount.
 */
@Injectable()
export class TurboRunCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
  ) {}

  /**
   * Pin the preflight amount and pricing before work starts. New callers also
   * persist the reservation identity; legacy in-flight batches retain the old
   * up-front-charge settlement behavior until they finish.
   */
  async recordUpfrontCharge(params: {
    turboRunId: string;
    credits: number;
    organizationId: string;
    pricingOptions?: TurboRunPricingOptions;
    reservationId?: string;
  }): Promise<boolean> {
    const turboRun = await this.prisma.turboRun.findFirst({
      select: { config: true, updatedAt: true },
      where: scopedWhere(params.organizationId, { id: params.turboRunId }),
    });

    if (!turboRun) {
      return false;
    }

    const config = (turboRun.config ?? {}) as TurboRunConfig;
    const ledger: TurboRunCreditsLedger = {
      ...(config.credits ?? {}),
      chargedCredits: (config.credits?.chargedCredits ?? 0) + params.credits,
      ...(params.reservationId ? { reservationId: params.reservationId } : {}),
    };

    // Name the shape before the cast. An inline literal widens the optional
    // nested config objects, and the stricter tsconfigs then reject the direct
    // `as Prisma.InputJsonValue` conversion as non-overlapping.
    const chargedConfig: TurboRunConfig = {
      ...config,
      credits: ledger,
      ...(params.pricingOptions ? { pricing: params.pricingOptions } : {}),
    };

    const recorded = await this.prisma.turboRun.updateMany({
      data: {
        config: chargedConfig as Prisma.InputJsonValue,
      },
      where: scopedWhere(params.organizationId, {
        id: params.turboRunId,
        updatedAt: turboRun.updatedAt,
      }),
    });

    if (recorded.count !== 1) {
      this.logger.warn(
        `Batch ${params.turboRunId} up-front charge not recorded: row changed`,
        { turboRunId: params.turboRunId, credits: params.credits },
      );
      return false;
    }
    return true;
  }

  /**
   * Reconcile the batch to the price of the drafts that actually landed.
   *
   * Safe to call more than once for the same batch: the ledger swap is the
   * gate, and a caller that loses it moves no credits at all.
   */
  async settleTurboRunCredits(params: {
    turboRunId: string;
    organizationId: string;
    userId: string;
  }): Promise<TurboRunCreditsSettlement> {
    const noop: TurboRunCreditsSettlement = {
      additionalCredits: 0,
      isAlreadySettled: true,
      refundCredits: 0,
      settledCredits: 0,
    };

    for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
      const turboRun = await this.prisma.turboRun.findFirst({
        select: {
          turboRunItems: turboRunItemRowsReadArgs(params.organizationId),
          brandId: true,
          config: true,
          items: true,
          updatedAt: true,
        },
        where: scopedWhere(params.organizationId, { id: params.turboRunId }),
      });

      if (!turboRun) {
        return noop;
      }

      const config = (turboRun.config ?? {}) as TurboRunConfig;
      const alreadyCharged = Math.max(0, config.credits?.chargedCredits ?? 0);

      if (config.credits?.reservationSettledAt) {
        return {
          additionalCredits: 0,
          isAlreadySettled: true,
          refundCredits: 0,
          settledCredits: alreadyCharged,
        };
      }

      // Bill completed drafts only, at the rates captured when the batch was
      // created — media-aware, so an item that gained a mediaUrl costs more.
      const billableItems = resolveTurboRunItems(turboRun)
        .filter(
          (item) => item.status === TurboRunItemStatus.COMPLETED && item.postId,
        )
        .map((item) => ({
          format: item.format,
          hasMedia: Boolean(item.mediaUrl),
        }));
      const { additionalCredits, refundCredits, settledCredits } =
        reconcileTurboRunCredits(
          alreadyCharged,
          billableItems,
          config.pricing ?? {},
        );

      if (config.credits?.reservationId) {
        const settlement = await this.settleReservedCredits({
          additionalCredits,
          alreadyCharged,
          turboRunId: params.turboRunId,
          brandId: turboRun.brandId,
          config,
          credits: {
            ...config.credits,
            reservationId: config.credits.reservationId,
          },
          organizationId: params.organizationId,
          refundCredits,
          settledCredits,
          updatedAt: turboRun.updatedAt,
          userId: params.userId,
        });
        if (settlement) {
          return settlement;
        }
        continue;
      }

      const settlementSeq = (config.credits?.settlementSeq ?? 0) + 1;
      const ledger: TurboRunCreditsLedger = {
        chargedCredits: settledCredits,
        refundedCredits: (config.credits?.refundedCredits ?? 0) + refundCredits,
        settledAt: new Date().toISOString(),
        settlementSeq,
      };

      // Claim the settlement before moving anything. `updatedAt` is the
      // compare-and-swap token: a redelivered job or a concurrent sweep that
      // loses the swap recomputes against the new ledger and finds nothing
      // owing. Recording first also means a failed credit move fails as an
      // under-charge, never as a double charge; the failure path below records
      // that exact under-charge for idempotent reconciliation.
      const settledConfig: TurboRunConfig = { ...config, credits: ledger };

      const claimed = await this.prisma.turboRun.updateMany({
        data: {
          config: settledConfig as Prisma.InputJsonValue,
        },
        where: scopedWhere(params.organizationId, {
          id: params.turboRunId,
          updatedAt: turboRun.updatedAt,
        }),
      });

      if (claimed.count !== 1) {
        continue;
      }

      await this.moveSettlementCredits({
        additionalCredits,
        turboRunId: params.turboRunId,
        brandId: turboRun.brandId,
        organizationId: params.organizationId,
        refundCredits,
        settlementSeq,
        userId: params.userId,
      });

      return {
        additionalCredits,
        isAlreadySettled: false,
        refundCredits,
        settledCredits,
      };
    }

    this.logger.warn(
      `Batch ${params.turboRunId} settlement skipped after concurrent updates`,
      { turboRunId: params.turboRunId },
    );
    return noop;
  }

  private async settleReservedCredits(params: {
    additionalCredits: number;
    alreadyCharged: number;
    turboRunId: string;
    brandId?: string | null;
    config: TurboRunConfig;
    credits: TurboRunCreditsLedger & { reservationId: string };
    organizationId: string;
    refundCredits: number;
    settledCredits: number;
    updatedAt: Date;
    userId: string;
  }): Promise<TurboRunCreditsSettlement | undefined> {
    const {
      additionalCredits,
      alreadyCharged,
      turboRunId,
      brandId,
      config,
      credits,
      organizationId,
      refundCredits,
      settledCredits,
      updatedAt,
      userId,
    } = params;
    if (!this.creditsUtilsService) {
      throw new InternalServerErrorException(
        'Credit reservation settlement service unavailable',
      );
    }

    if (settledCredits > 0) {
      // A reservation may only settle up to its held amount. Batch pricing
      // starts caption-only, so media attached during processing can make
      // the final cost higher. Settle the hold itself, then collect the
      // reviewed overage through the existing idempotent shortfall path.
      const reservationSettlement =
        additionalCredits > 0 ? alreadyCharged : settledCredits;
      await this.creditsUtilsService.settleReservation({
        actualAmount: reservationSettlement,
        actorUserId: userId,
        brandId,
        description: `Batch generation ${turboRunId} settlement`,
        organizationId: organizationId,
        reservationId: credits.reservationId,
        source: ActivitySource.SCRIPT,
      });
    } else {
      await this.creditsUtilsService.releaseReservation({
        organizationId: organizationId,
        reservationId: credits.reservationId,
      });
    }

    const reservationSettledAt = new Date().toISOString();
    const settlementSeq = (credits.settlementSeq ?? 0) + 1;
    const reservationLedger: TurboRunCreditsLedger = {
      ...credits,
      chargedCredits: settledCredits,
      refundedCredits: (credits.refundedCredits ?? 0) + refundCredits,
      reservationSettledAt,
      settledAt: reservationSettledAt,
      settlementSeq,
    };
    const reservationConfig: TurboRunConfig = {
      ...config,
      credits: reservationLedger,
    };
    const claimed = await this.prisma.turboRun.updateMany({
      data: {
        config: reservationConfig as Prisma.InputJsonValue,
      },
      where: scopedWhere(organizationId, {
        id: turboRunId,
        updatedAt: updatedAt,
      }),
    });

    if (claimed.count !== 1) {
      return undefined;
    }

    if (additionalCredits > 0) {
      await this.moveSettlementCredits({
        additionalCredits,
        turboRunId: turboRunId,
        brandId,
        organizationId: organizationId,
        refundCredits: 0,
        settlementSeq,
        userId: userId,
      });
    }

    return {
      additionalCredits,
      isAlreadySettled: false,
      refundCredits,
      settledCredits,
    };
  }

  /**
   * Retry only the exact shortfall recorded by a failed settlement deduction.
   *
   * The claim is a real compare-and-swap: the marker is negated while one
   * worker collects it, so a concurrent sweep's guarded update matches 0 rows
   * (the old form wrote the value back onto itself — an existence check both
   * sweeps could pass, letting both deduct). The sweep only selects positive
   * markers, so a claimed row is invisible until collection clears it or a
   * failure restores it. The credit-transaction reference keeps ambiguous
   * retries of the same occurrence idempotent.
   */
  async retrySettlementShortfall(params: {
    turboRunId: string;
    organizationId: string;
    settlementShortfall: number;
    settlementShortfallSeq: number;
    userId: string;
  }): Promise<boolean> {
    if (!this.creditsUtilsService || params.settlementShortfall <= 0) {
      return false;
    }

    const claimed = await this.prisma.turboRun.updateMany({
      data: { settlementShortfall: -params.settlementShortfall },
      where: scopedWhere(params.organizationId, {
        id: params.turboRunId,
        settlementShortfall: params.settlementShortfall,
        settlementShortfallSeq: params.settlementShortfallSeq,
      }),
    });

    if (claimed.count !== 1) {
      return false;
    }

    try {
      const turboRun = await this.prisma.turboRun.findFirst({
        select: { brandId: true },
        where: scopedWhere(params.organizationId, { id: params.turboRunId }),
      });
      await this.deductSettlementCredits({
        turboRunId: params.turboRunId,
        brandId: turboRun?.brandId,
        organizationId: params.organizationId,
        settlementSeq: params.settlementShortfallSeq,
        settlementShortfall: params.settlementShortfall,
        userId: params.userId,
      });
    } catch (error: unknown) {
      // Restore the positive marker so the next sweep retries. The original
      // failure already alerted; a recurring retry failure while the balance
      // stays exhausted is expected and must not spam Sentry every tick.
      await this.restoreShortfallMarker(params);
      this.logger.error(
        `Batch ${params.turboRunId} settlement shortfall retry failed`,
        error,
        {
          turboRunId: params.turboRunId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        },
      );
      return false;
    }

    const cleared = await this.prisma.turboRun.updateMany({
      data: { settlementShortfall: null, settlementShortfallSeq: null },
      where: scopedWhere(params.organizationId, {
        id: params.turboRunId,
        settlementShortfall: -params.settlementShortfall,
        settlementShortfallSeq: params.settlementShortfallSeq,
      }),
    });

    return cleared.count === 1;
  }

  /**
   * Hand a claimed (negated) marker back to the sweep after a failed
   * collection. Guarded on the claimed form so it can never resurrect a marker
   * another path already cleared.
   */
  private async restoreShortfallMarker(params: {
    turboRunId: string;
    organizationId: string;
    settlementShortfall: number;
    settlementShortfallSeq: number;
  }): Promise<void> {
    try {
      await this.prisma.turboRun.updateMany({
        data: { settlementShortfall: params.settlementShortfall },
        where: scopedWhere(params.organizationId, {
          id: params.turboRunId,
          settlementShortfall: -params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        }),
      });
    } catch (restoreError: unknown) {
      // A stranded claimed marker stays visible in the column (negative) but
      // is skipped by the sweep; alert so it can be restored by hand.
      Sentry.captureException(restoreError, {
        extra: {
          turboRunId: params.turboRunId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        },
        tags: {
          operation: 'batch-credit-settlement-marker',
        },
      });
      this.logger.error(
        `Batch ${params.turboRunId} settlement shortfall marker restore failed`,
        restoreError,
        {
          turboRunId: params.turboRunId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
        },
      );
    }
  }

  private async moveSettlementCredits(params: {
    additionalCredits: number;
    turboRunId: string;
    brandId?: string | null;
    organizationId: string;
    refundCredits: number;
    settlementSeq: number;
    userId: string;
  }): Promise<void> {
    if (!this.creditsUtilsService) {
      return;
    }

    if (params.additionalCredits > 0) {
      try {
        await this.deductSettlementCredits({
          turboRunId: params.turboRunId,
          brandId: params.brandId,
          organizationId: params.organizationId,
          settlementSeq: params.settlementSeq,
          settlementShortfall: params.additionalCredits,
          userId: params.userId,
        });
      } catch (error: unknown) {
        await this.handleSettlementDeductionFailure(
          {
            turboRunId: params.turboRunId,
            organizationId: params.organizationId,
            settlementSeq: params.settlementSeq,
            settlementShortfall: params.additionalCredits,
            userId: params.userId,
          },
          error,
        );
      }
      return;
    }

    try {
      if (params.refundCredits > 0) {
        await this.creditsUtilsService.refundOrganizationCredits(
          params.organizationId,
          params.refundCredits,
          'turbo-run-refund',
          `Batch generation ${params.turboRunId} settlement`,
          new Date(Date.now() + REFUND_EXPIRY_MS),
          {
            brandId: params.brandId,
            idempotencyKey: `turbo-run-refund:${params.turboRunId}:${params.settlementSeq}`,
            referenceId: params.turboRunId,
            referenceType: 'turbo_run',
          },
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Batch ${params.turboRunId} credit settlement move failed`,
        error,
        {
          additionalCredits: params.additionalCredits,
          turboRunId: params.turboRunId,
          refundCredits: params.refundCredits,
        },
      );
    }
  }

  private async deductSettlementCredits(params: {
    turboRunId: string;
    brandId?: string | null;
    organizationId: string;
    settlementSeq: number;
    settlementShortfall: number;
    userId: string;
  }): Promise<void> {
    // The reference is scoped to one settlement occurrence, not the batch: a
    // resumed batch legitimately settles again with a new delta, and that new
    // occurrence must charge rather than match the previous occurrence's
    // transaction. Retries of the SAME occurrence (the shortfall sweep, or an
    // ambiguous failure after the deduction committed) reuse the same seq and
    // stay idempotent through the existing reference lookup.
    await this.creditsUtilsService?.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      params.settlementShortfall,
      `Batch generation ${params.turboRunId} settlement`,
      ActivitySource.SCRIPT,
      {
        brandId: params.brandId,
        metadata: { turboRunId: params.turboRunId },
        referenceId: `${params.turboRunId}:${params.settlementSeq}`,
        referenceType: TURBO_RUN_SETTLEMENT_REFERENCE_TYPE,
      },
    );
  }

  private async handleSettlementDeductionFailure(
    params: {
      turboRunId: string;
      organizationId: string;
      settlementSeq: number;
      settlementShortfall: number;
      userId: string;
    },
    error: unknown,
  ): Promise<void> {
    try {
      // Only claim a free marker. Overwriting would erase an earlier, still
      // uncollected shortfall; the rare second concurrent shortfall is alerted
      // below instead of silently replacing the first.
      const marked = await this.prisma.turboRun.updateMany({
        data: {
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementSeq,
        },
        where: scopedWhere(params.organizationId, {
          id: params.turboRunId,
          settlementShortfall: null,
        }),
      });

      if (marked.count !== 1) {
        Sentry.captureException(
          new Error(
            `Batch ${params.turboRunId} settlement shortfall is NOT durably tracked: marker occupied or batch missing`,
          ),
          {
            extra: {
              turboRunId: params.turboRunId,
              organizationId: params.organizationId,
              settlementSeq: params.settlementSeq,
              settlementShortfall: params.settlementShortfall,
            },
            tags: {
              operation: 'batch-credit-settlement-marker',
            },
          },
        );
        this.logger.error(
          `Batch ${params.turboRunId} settlement shortfall marker was not persisted`,
          undefined,
          {
            turboRunId: params.turboRunId,
            organizationId: params.organizationId,
            settlementSeq: params.settlementSeq,
            settlementShortfall: params.settlementShortfall,
          },
        );
      }
    } catch (markerError: unknown) {
      this.logger.error(
        `Batch ${params.turboRunId} settlement shortfall marker failed to persist`,
        markerError,
        {
          turboRunId: params.turboRunId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
        },
      );
    }

    Sentry.captureException(error, {
      extra: {
        turboRunId: params.turboRunId,
        organizationId: params.organizationId,
        settlementShortfall: params.settlementShortfall,
      },
      tags: {
        operation: 'batch-credit-settlement',
      },
    });

    // The settled ledger remains the never-double-charge gate. The shortfall
    // marker is now the only retry amount; no sweep recomputes it from drafts.
    this.logger.error(
      `Batch ${params.turboRunId} credit settlement deduction failed`,
      error,
      {
        turboRunId: params.turboRunId,
        organizationId: params.organizationId,
        settlementShortfall: params.settlementShortfall,
      },
    );
  }
}
