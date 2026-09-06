import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { scopedWhere } from '@api/index';
import {
  type BatchConfig,
  type BatchCreditsLedger,
  resolveBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { batchItemRowsReadArgs } from '@api/services/batch-generation/batch-item-rows';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, BatchItemStatus } from '@genfeedai/contracts';
import {
  type BatchPricingOptions,
  reconcileBatchGenerationCredits,
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
const BATCH_SETTLEMENT_REFERENCE_TYPE = 'batch-generation:settlement';

export type BatchCreditsSettlement = {
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
export class BatchGenerationCreditsService {
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
    batchId: string;
    credits: number;
    organizationId: string;
    pricingOptions?: BatchPricingOptions;
    reservationId?: string;
  }): Promise<boolean> {
    const batch = await this.prisma.batch.findFirst({
      select: { config: true, updatedAt: true },
      where: scopedWhere(params.organizationId, { id: params.batchId }),
    });

    if (!batch) {
      return false;
    }

    const config = (batch.config ?? {}) as BatchConfig;
    const ledger: BatchCreditsLedger = {
      ...(config.credits ?? {}),
      chargedCredits: (config.credits?.chargedCredits ?? 0) + params.credits,
      ...(params.reservationId ? { reservationId: params.reservationId } : {}),
    };

    // Name the shape before the cast. An inline literal widens the optional
    // nested config objects, and the stricter tsconfigs then reject the direct
    // `as Prisma.InputJsonValue` conversion as non-overlapping.
    const chargedConfig: BatchConfig = {
      ...config,
      credits: ledger,
      ...(params.pricingOptions ? { pricing: params.pricingOptions } : {}),
    };

    const recorded = await this.prisma.batch.updateMany({
      data: {
        config: chargedConfig as Prisma.InputJsonValue,
      },
      where: scopedWhere(params.organizationId, {
        id: params.batchId,
        updatedAt: batch.updatedAt,
      }),
    });

    if (recorded.count !== 1) {
      this.logger.warn(
        `Batch ${params.batchId} up-front charge not recorded: row changed`,
        { batchId: params.batchId, credits: params.credits },
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
  async settleBatchCredits(params: {
    batchId: string;
    organizationId: string;
    userId: string;
  }): Promise<BatchCreditsSettlement> {
    const noop: BatchCreditsSettlement = {
      additionalCredits: 0,
      isAlreadySettled: true,
      refundCredits: 0,
      settledCredits: 0,
    };

    for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
      const batch = await this.prisma.batch.findFirst({
        select: {
          batchItems: batchItemRowsReadArgs(params.organizationId),
          config: true,
          items: true,
          updatedAt: true,
        },
        where: scopedWhere(params.organizationId, { id: params.batchId }),
      });

      if (!batch) {
        return noop;
      }

      const config = (batch.config ?? {}) as BatchConfig;
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
      const billableItems = resolveBatchItems(batch)
        .filter(
          (item) => item.status === BatchItemStatus.COMPLETED && item.postId,
        )
        .map((item) => ({
          format: item.format,
          hasMedia: Boolean(item.mediaUrl),
        }));
      const { additionalCredits, refundCredits, settledCredits } =
        reconcileBatchGenerationCredits(
          alreadyCharged,
          billableItems,
          config.pricing ?? {},
        );

      if (config.credits?.reservationId) {
        const settlement = await this.settleReservedCredits({
          additionalCredits,
          alreadyCharged,
          batchId: params.batchId,
          config,
          credits: {
            ...config.credits,
            reservationId: config.credits.reservationId,
          },
          organizationId: params.organizationId,
          refundCredits,
          settledCredits,
          updatedAt: batch.updatedAt,
          userId: params.userId,
        });
        if (settlement) {
          return settlement;
        }
        continue;
      }

      const settlementSeq = (config.credits?.settlementSeq ?? 0) + 1;
      const ledger: BatchCreditsLedger = {
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
      const settledConfig: BatchConfig = { ...config, credits: ledger };

      const claimed = await this.prisma.batch.updateMany({
        data: {
          config: settledConfig as Prisma.InputJsonValue,
        },
        where: scopedWhere(params.organizationId, {
          id: params.batchId,
          updatedAt: batch.updatedAt,
        }),
      });

      if (claimed.count !== 1) {
        continue;
      }

      await this.moveSettlementCredits({
        additionalCredits,
        batchId: params.batchId,
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
      `Batch ${params.batchId} settlement skipped after concurrent updates`,
      { batchId: params.batchId },
    );
    return noop;
  }

  private async settleReservedCredits(params: {
    additionalCredits: number;
    alreadyCharged: number;
    batchId: string;
    config: BatchConfig;
    credits: BatchCreditsLedger & { reservationId: string };
    organizationId: string;
    refundCredits: number;
    settledCredits: number;
    updatedAt: Date;
    userId: string;
  }): Promise<BatchCreditsSettlement | undefined> {
    const {
      additionalCredits,
      alreadyCharged,
      batchId,
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
        description: `Batch generation ${batchId} settlement`,
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
    const reservationLedger: BatchCreditsLedger = {
      ...credits,
      chargedCredits: settledCredits,
      refundedCredits: (credits.refundedCredits ?? 0) + refundCredits,
      reservationSettledAt,
      settledAt: reservationSettledAt,
      settlementSeq,
    };
    const reservationConfig: BatchConfig = {
      ...config,
      credits: reservationLedger,
    };
    const claimed = await this.prisma.batch.updateMany({
      data: {
        config: reservationConfig as Prisma.InputJsonValue,
      },
      where: scopedWhere(organizationId, {
        id: batchId,
        updatedAt: updatedAt,
      }),
    });

    if (claimed.count !== 1) {
      return undefined;
    }

    if (additionalCredits > 0) {
      await this.moveSettlementCredits({
        additionalCredits,
        batchId: batchId,
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
    batchId: string;
    organizationId: string;
    settlementShortfall: number;
    settlementShortfallSeq: number;
    userId: string;
  }): Promise<boolean> {
    if (!this.creditsUtilsService || params.settlementShortfall <= 0) {
      return false;
    }

    const claimed = await this.prisma.batch.updateMany({
      data: { settlementShortfall: -params.settlementShortfall },
      where: scopedWhere(params.organizationId, {
        id: params.batchId,
        settlementShortfall: params.settlementShortfall,
        settlementShortfallSeq: params.settlementShortfallSeq,
      }),
    });

    if (claimed.count !== 1) {
      return false;
    }

    try {
      await this.deductSettlementCredits({
        batchId: params.batchId,
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
        `Batch ${params.batchId} settlement shortfall retry failed`,
        error,
        {
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        },
      );
      return false;
    }

    const cleared = await this.prisma.batch.updateMany({
      data: { settlementShortfall: null, settlementShortfallSeq: null },
      where: scopedWhere(params.organizationId, {
        id: params.batchId,
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
    batchId: string;
    organizationId: string;
    settlementShortfall: number;
    settlementShortfallSeq: number;
  }): Promise<void> {
    try {
      await this.prisma.batch.updateMany({
        data: { settlementShortfall: params.settlementShortfall },
        where: scopedWhere(params.organizationId, {
          id: params.batchId,
          settlementShortfall: -params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        }),
      });
    } catch (restoreError: unknown) {
      // A stranded claimed marker stays visible in the column (negative) but
      // is skipped by the sweep; alert so it can be restored by hand.
      Sentry.captureException(restoreError, {
        extra: {
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        },
        tags: {
          operation: 'batch-credit-settlement-marker',
        },
      });
      this.logger.error(
        `Batch ${params.batchId} settlement shortfall marker restore failed`,
        restoreError,
        {
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
        },
      );
    }
  }

  private async moveSettlementCredits(params: {
    additionalCredits: number;
    batchId: string;
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
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementSeq: params.settlementSeq,
          settlementShortfall: params.additionalCredits,
          userId: params.userId,
        });
      } catch (error: unknown) {
        await this.handleSettlementDeductionFailure(
          {
            batchId: params.batchId,
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
          'batch-generation-refund',
          `Batch generation ${params.batchId} settlement`,
          new Date(Date.now() + REFUND_EXPIRY_MS),
          {
            idempotencyKey: `batch-refund:${params.batchId}:${params.settlementSeq}`,
            referenceId: params.batchId,
            referenceType: 'batch_generation',
          },
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Batch ${params.batchId} credit settlement move failed`,
        error,
        {
          additionalCredits: params.additionalCredits,
          batchId: params.batchId,
          refundCredits: params.refundCredits,
        },
      );
    }
  }

  private async deductSettlementCredits(params: {
    batchId: string;
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
      `Batch generation ${params.batchId} settlement`,
      ActivitySource.SCRIPT,
      {
        metadata: { batchId: params.batchId },
        referenceId: `${params.batchId}:${params.settlementSeq}`,
        referenceType: BATCH_SETTLEMENT_REFERENCE_TYPE,
      },
    );
  }

  private async handleSettlementDeductionFailure(
    params: {
      batchId: string;
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
      const marked = await this.prisma.batch.updateMany({
        data: {
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementSeq,
        },
        where: scopedWhere(params.organizationId, {
          id: params.batchId,
          settlementShortfall: null,
        }),
      });

      if (marked.count !== 1) {
        Sentry.captureException(
          new Error(
            `Batch ${params.batchId} settlement shortfall is NOT durably tracked: marker occupied or batch missing`,
          ),
          {
            extra: {
              batchId: params.batchId,
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
          `Batch ${params.batchId} settlement shortfall marker was not persisted`,
          undefined,
          {
            batchId: params.batchId,
            organizationId: params.organizationId,
            settlementSeq: params.settlementSeq,
            settlementShortfall: params.settlementShortfall,
          },
        );
      }
    } catch (markerError: unknown) {
      this.logger.error(
        `Batch ${params.batchId} settlement shortfall marker failed to persist`,
        markerError,
        {
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
        },
      );
    }

    Sentry.captureException(error, {
      extra: {
        batchId: params.batchId,
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
      `Batch ${params.batchId} credit settlement deduction failed`,
      error,
      {
        batchId: params.batchId,
        organizationId: params.organizationId,
        settlementShortfall: params.settlementShortfall,
      },
    );
  }
}
